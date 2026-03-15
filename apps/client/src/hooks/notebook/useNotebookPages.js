import { useCallback, useRef, useState } from 'react';
import { generateId } from 'xournote-shared';
import { createPage, getCurrentPage, getPageIndex } from '../../utils/page';

export const useNotebookPages = (initialPageId) => {
  const initialPageIdRef = useRef(initialPageId || generateId('page'));
  const [pages, setPages] = useState([createPage(initialPageIdRef.current)]);
  const [currentPageId, setCurrentPageId] = useState(initialPageIdRef.current);

  const currentPage = getCurrentPage(pages, currentPageId);

  const setActivePage = useCallback(
    (pageId, fallbackPage) => {
      const nextPage = fallbackPage || pages.find((page) => page.id === pageId);
      if (!nextPage) return;
      setCurrentPageId(pageId);
    },
    [pages],
  );

  const setPageText = useCallback((pageId, text) => {
    setPages((prev) => prev.map((page) => (page.id === pageId ? { ...page, text } : page)));
  }, []);

  const setPageStrokes = useCallback((pageId, nextStrokesOrUpdater) => {
    setPages((prev) =>
      prev.map((page) => {
        if (page.id !== pageId) return page;
        const nextStrokes =
          typeof nextStrokesOrUpdater === 'function' ? nextStrokesOrUpdater(page.strokes) : nextStrokesOrUpdater;
        return { ...page, strokes: nextStrokes };
      }),
    );
  }, []);

  const appendStroke = useCallback((pageId, stroke) => {
    setPageStrokes(pageId, (prev) => [...prev, stroke]);
  }, [setPageStrokes]);

  const replaceLatestStroke = useCallback(
    (pageId, stroke) => {
      setPageStrokes(pageId, (prev) => {
        if (!prev.length) return prev;
        const next = [...prev];
        next[next.length - 1] = stroke;
        return next;
      });
    },
    [setPageStrokes],
  );

  const removeStroke = useCallback(
    (pageId, strokeId) => {
      setPageStrokes(pageId, (prev) => prev.filter((stroke) => stroke.id !== strokeId));
    },
    [setPageStrokes],
  );

  const clearPageStrokes = useCallback((pageId) => {
    setPageStrokes(pageId, []);
  }, [setPageStrokes]);

  const addPage = useCallback((page) => {
    setPages((prev) => {
      if (prev.some((existing) => existing.id === page.id)) return prev;
      return [...prev, page];
    });
  }, []);

  const gotoPage = useCallback(
    (direction) => {
      const currentIndex = getPageIndex(pages, currentPageId);
      if (currentIndex === -1) return;
      const nextIndex = direction === 'prev' ? currentIndex - 1 : currentIndex + 1;
      if (nextIndex < 0 || nextIndex >= pages.length) return;
      setCurrentPageId(pages[nextIndex].id);
    },
    [currentPageId, pages],
  );

  return {
    pages,
    currentPage,
    currentPageId,
    setActivePage,
    setPageText,
    setPageStrokes,
    appendStroke,
    replaceLatestStroke,
    removeStroke,
    clearPageStrokes,
    addPage,
    gotoPage,
    setPages,
  };
};

export default useNotebookPages;
