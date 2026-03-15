import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AppHeader from '../components/AppHeader';
import PageSurface from '../components/PageSurface';
import Pager from '../components/Pager';
import Toolbar from '../components/Toolbar';
import useServerStateSync from '../hooks/collaboration/useServerStateSync';
import useRealtimeSync from '../hooks/collaboration/useRealtimeSync';
import useCanvasDrawing from '../hooks/notebook/useCanvasDrawing';
import useNotebookPages from '../hooks/notebook/useNotebookPages';
import exportPagesToPdf from '../features/export/exportToPdf';
import { DEFAULT_INK_COLOR, DEFAULT_INK_WIDTH, TEXT_UPDATE_DEBOUNCE_MS, PENTOOL } from '../data/constants';
import { drawStroke } from '../utils/drawing';
import { createPage, getPageIndex } from '../utils/page';
import { generateId } from 'xournote-shared';

// NotebookPage wires together drawing, text editing, realtime sync, and navigation UI.
// Comments throughout explain how hooks/refs move data between handlers, the canvas,
// realtime messaging, and child components.

const NotebookPage = () => {
  const {
    pages,
    currentPage,
    currentPageId,
    setActivePage,
    setPageText,
    appendStroke,
    replaceLatestStroke,
    removeStroke,
    clearPageStrokes,
    addPage,
    gotoPage,
    setPages,
  } = useNotebookPages();

  const [inkColor, setInkColor] = useState(DEFAULT_INK_COLOR);
  const [inkWidth, setInkWidth] = useState(DEFAULT_INK_WIDTH);
  const [tool, setTool] = useState(PENTOOL.OFF);

  // Refs keep mutable canvas/drawing state out of React renders while still letting
  // hooks share and update the same objects between pointer events and effects.
  const canvasRef = useRef(null);
  const canvasShellRef = useRef(null);
  const canvasSizeRef = useRef({ width: 0, height: 0, dpr: 1 });
  const strokesRef = useRef([]);
  const currentStrokeRef = useRef(null);
  const isDrawingRef = useRef(false);
  const strokeIdsRef = useRef({});
  const ignoreTextSend = useRef(false);
  const currentPageIdRef = useRef(currentPageId);

  const ensureStrokeSet = useCallback((pageId) => {
    // Maintain a per-page Set of stroke ids so we can dedupe incoming realtime strokes.
    if (!strokeIdsRef.current[pageId]) {
      strokeIdsRef.current[pageId] = new Set();
    }
    return strokeIdsRef.current[pageId];
  }, []);

  const serverSyncHandlers = useServerStateSync({
    // The server sync hook centralizes inbound message normalization and applies
    // changes to the notebook store so this component stays focused on UI wiring.
    setPages,
    setActivePage,
    addPage,
    setPageText,
    appendStroke,
    removeStroke,
    clearPageStrokes,
    ensureStrokeSet,
    currentPageIdRef,
    ignoreTextSend,
  });

  const { connectionStatus, sendMessage } = useRealtimeSync({
    // Collaboration wiring: the realtime sync hook handles socket lifecycle and
    // delegates parsed messages to the callbacks supplied by useServerStateSync.
    ...serverSyncHandlers,
    currentPageIdRef,
  });

  // Memoize the current page strokes so drawing and hit-testing can reuse the same
  // array reference until the page actually changes.
  const strokes = useMemo(() => currentPage?.strokes || [], [currentPage]);

  const {
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerLeave,
    clearCanvas,
  } = useCanvasDrawing({
    // The canvas drawing hook owns pointer handling, stroke lifecycle, and broadcast
    // messages so this component only needs to pass refs/state into it.
    tool,
    inkColor,
    inkWidth,
    currentPageId,
    strokes,
    canvasRef,
    canvasSizeRef,
    currentStrokeRef,
    isDrawingRef,
    ensureStrokeSet,
    appendStroke,
    replaceLatestStroke,
    removeStroke,
    clearPageStrokes,
    sendMessage,
  });

  useEffect(() => {
    // Debounced outbound text sync: after local edits, wait then send updates to peers.
    // ignoreTextSend lets remote-origin changes skip this send to prevent echo.
    if (!currentPage) return undefined;
    if (ignoreTextSend.current) {
      ignoreTextSend.current = false;
      return undefined;
    }

    const handle = setTimeout(() => {
      sendMessage({ type: 'text:update', pageId: currentPageId, data: currentPage.text || '' });
      sendMessage({ type: 'update', pageId: currentPageId, data: currentPage.text || '' });
    }, TEXT_UPDATE_DEBOUNCE_MS);

    return () => clearTimeout(handle);
  }, [currentPage, currentPageId, sendMessage]);

  useEffect(() => {
    // Canvas sizing + redraw: match canvas resolution to its shell + device pixel ratio,
    // then re-render strokes. Also re-runs on window resize.
    const canvas = canvasRef.current;
    const shell = canvasShellRef.current;
    if (!canvas || !shell) return undefined;
    const ctx = canvas.getContext('2d');

    const resize = () => {
      const rect = shell.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvasSizeRef.current = { width: rect.width, height: rect.height, dpr };
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, rect.width, rect.height);
      strokesRef.current.forEach((stroke) => drawStroke(ctx, stroke, rect));
    };

    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  useEffect(() => {
    // When page strokes change, cache them in a ref (used by resize redraw) and repaint the
    // canvas at the current DPI.
    strokesRef.current = strokes;
    const canvas = canvasRef.current;
    const shell = canvasShellRef.current;
    if (!canvas || !shell) return;
    const ctx = canvas.getContext('2d');
    const { width, height, dpr } = canvasSizeRef.current;
    if (!width || !height) return;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);
    const rect = { width, height };
    strokes.forEach((stroke) => drawStroke(ctx, stroke, rect));
  }, [strokes]);

  const handleAddPage = useCallback(() => {
    // Local add page flow: generate id, create default page, mark active, broadcast.
    const newId = generateId('page');
    const newPage = createPage(newId);
    ensureStrokeSet(newId);
    addPage(newPage);
    setActivePage(newId, newPage);
    sendMessage({ type: 'page:add', data: newPage });
  }, [addPage, ensureStrokeSet, sendMessage, setActivePage]);

  const exportToPdf = useCallback(async () => {
    // Export feature: delegates to exportPagesToPdf; early return when no pages are
    // available so we do not generate empty PDF files.
    if (!pages || pages.length === 0) return;
    await exportPagesToPdf(pages);
  }, [pages]);

  // useMemo caches derived values between renders (React tip): here it avoids re-running
  // getPageIndex unless pages or currentPageId change; textValue is a simple fallback.
  const currentPageIndex = useMemo(() => getPageIndex(pages, currentPageId), [currentPageId, pages]);
  const textValue = currentPage?.text || '';

  return (
    <div className="app">
      {/* AppHeader displays realtime connection status passed from useRealtimeSync. */}
      <AppHeader connectionStatus={connectionStatus} />

      <main className="workspace-single">
        {/* Toolbar: controls ink color/width, toggles draw/erase, clears canvas, adds pages,
            and triggers PDF export. Callbacks update local state and, where relevant,
            propagate to collaborators. */}
        <Toolbar
          inkColor={inkColor}
          inkWidth={inkWidth}
          tool={tool}
          onInkColorChange={(event) => setInkColor(event.target.value)}
          onInkWidthChange={(event) => setInkWidth(Number(event.target.value))}
          onToggleDraw={() => setTool((prev) => (prev === PENTOOL.DRAWING ? PENTOOL.OFF : PENTOOL.DRAWING))}
          onToggleErase={() => setTool((prev) => (prev === PENTOOL.ERASE ? PENTOOL.OFF : PENTOOL.ERASE))}
          onClearCanvas={clearCanvas}
          onAddPage={handleAddPage}
          onExportPdf={exportToPdf}
        />

        {/* Pager: drives navigation between pages; gotoPage comes from useNotebookPages and
            updates active page state used throughout the component. */}
        <Pager
          currentIndex={currentPageIndex >= 0 ? currentPageIndex : 0}
          totalPages={pages.length}
          onPrev={() => gotoPage('prev')}
          onNext={() => gotoPage('next')}
        />

        {/* PageSurface: renders text area + drawing canvas. We supply refs for canvas access,
            the active tool, current text value, and all pointer handlers so strokes/erasures
            flow through the logic above. onTextChange writes to notebook state. */}
        <PageSurface
          text={textValue}
          onTextChange={(value) => setPageText(currentPageId, value)}
          tool={tool}
          canvasRef={canvasRef}
          canvasShellRef={canvasShellRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerLeave}
        />
      </main>
    </div>
  );
};

export default NotebookPage;
