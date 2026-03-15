export const createPage = (id) => ({ id, text: '', strokes: [] });

export const getPageIndex = (pages, pageId) => pages.findIndex((page) => page.id === pageId);

export const getCurrentPage = (pages, currentPageId) => {
  if (!pages || pages.length === 0) return undefined;
  return pages.find((page) => page.id === currentPageId) || pages[0];
};
