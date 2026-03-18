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

const getNotebookIdFromUrl = () => {
  const path = window.location.pathname.replace(/^\//, '');
  const id = Number(path);
  return path && !Number.isNaN(id) ? id : null;
};

const NotebookPage = () => {
  const [notebookId] = useState(getNotebookIdFromUrl);
  const [limitReached, setLimitReached] = useState(false);

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
    if (!strokeIdsRef.current[pageId]) {
      strokeIdsRef.current[pageId] = new Set();
    }
    return strokeIdsRef.current[pageId];
  }, []);

  const onNotebookCreated = useCallback((id) => {
    window.history.replaceState({}, '', '/' + id);
  }, []);

  const onNotebookNotFound = useCallback(() => {
    window.location.replace('/');
  }, []);

  const onNotebookLimitReached = useCallback(() => {
    setLimitReached(true);
  }, []);

  const serverSyncHandlers = useServerStateSync({
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
    notebookId,
    ...serverSyncHandlers,
    onNotebookCreated,
    onNotebookNotFound,
    onNotebookLimitReached,
    currentPageIdRef,
  });

  const strokes = useMemo(() => currentPage?.strokes || [], [currentPage]);

  const {
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerLeave,
    clearCanvas,
  } = useCanvasDrawing({
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
    const newId = generateId('page');
    const newPage = createPage(newId);
    ensureStrokeSet(newId);
    addPage(newPage);
    setActivePage(newId, newPage);
    sendMessage({ type: 'page:add', data: newPage });
  }, [addPage, ensureStrokeSet, sendMessage, setActivePage]);

  const exportToPdf = useCallback(async () => {
    if (!pages || pages.length === 0) return;
    await exportPagesToPdf(pages);
  }, [pages]);

  const currentPageIndex = useMemo(() => getPageIndex(pages, currentPageId), [currentPageId, pages]);
  const textValue = currentPage?.text || '';

  return (
    <div className="app">
      <AppHeader connectionStatus={connectionStatus} />

      {limitReached && (
        <div className="limit-warning">
          Notebook limit reached. Your changes will not be synced.
        </div>
      )}

      <main className="workspace-single">
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

        <Pager
          currentIndex={currentPageIndex >= 0 ? currentPageIndex : 0}
          totalPages={pages.length}
          onPrev={() => gotoPage('prev')}
          onNext={() => gotoPage('next')}
        />

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
