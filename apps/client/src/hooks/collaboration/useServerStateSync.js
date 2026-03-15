import { useCallback } from 'react';
import { generateId } from 'xournote-shared';
import { createPage } from '../../utils/page';

const useServerStateSync = ({
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
} = {}) => {
  const hydratePages = useCallback(
    (incomingPages) => {
      const normalizedPages =
        incomingPages && incomingPages.length > 0 ? incomingPages : [createPage(generateId('page'))];

      normalizedPages.forEach((page) => ensureStrokeSet(page.id));

      setPages(normalizedPages);
      setActivePage(normalizedPages[0].id, normalizedPages[0]);

      ignoreTextSend.current = true;
    },
    [ensureStrokeSet, ignoreTextSend, setActivePage, setPages],
  );

  const handleInit = useCallback(
    (incoming) => {
      const pagesFromServer = Array.isArray(incoming?.pages) ? incoming.pages : [];
      hydratePages(pagesFromServer);
    },
    [hydratePages],
  );

  const handlePageAdd = useCallback(
    (page) => {
      ensureStrokeSet(page.id);
      addPage({ id: page.id, text: page.text || '', strokes: page.strokes || [] });
    },
    [addPage, ensureStrokeSet],
  );

  const handleTextUpdate = useCallback(
    (pageId, value) => {
      const targetId = pageId || currentPageIdRef.current;
      ignoreTextSend.current = true;
      setPageText(targetId, value);
    },
    [currentPageIdRef, ignoreTextSend, setPageText],
  );

  const handleStrokeAdd = useCallback(
    (pageId, stroke) => {
      if (!stroke) return;
      const targetId = pageId || currentPageIdRef.current;
      const setForPage = ensureStrokeSet(targetId);
      if (setForPage.has(stroke.id)) return;
      setForPage.add(stroke.id);
      appendStroke(targetId, stroke);
    },
    [appendStroke, currentPageIdRef, ensureStrokeSet],
  );

  const handleStrokeRemove = useCallback(
    (pageId, strokeId) => {
      const targetId = pageId || currentPageIdRef.current;
      const setForPage = ensureStrokeSet(targetId);
      setForPage.delete(strokeId);
      removeStroke(targetId, strokeId);
    },
    [currentPageIdRef, ensureStrokeSet, removeStroke],
  );

  const handleCanvasClear = useCallback(
    (pageId) => {
      const targetId = pageId || currentPageIdRef.current;
      ensureStrokeSet(targetId).clear();
      clearPageStrokes(targetId);
    },
    [clearPageStrokes, currentPageIdRef, ensureStrokeSet],
  );

  return {
    onInit: handleInit,
    onPageAdd: handlePageAdd,
    onTextUpdate: handleTextUpdate,
    onStrokeAdd: handleStrokeAdd,
    onStrokeRemove: handleStrokeRemove,
    onCanvasClear: handleCanvasClear,
  };
};

export default useServerStateSync;
