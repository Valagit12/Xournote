import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { drawStroke } from '../../utils/drawing';

const renderPageForExport = async (page) => {
  const container = document.createElement('div');
  container.className = 'page page--export';
  container.style.position = 'absolute';
  container.style.left = '-12000px';
  container.style.top = '0';

  const body = document.createElement('div');
  body.className = 'page__body';
  const textDiv = document.createElement('div');
  textDiv.className = 'text-export';
  textDiv.textContent = page.text || '';
  body.appendChild(textDiv);

  const canvasShell = document.createElement('div');
  canvasShell.className = 'canvas-shell';
  canvasShell.style.pointerEvents = 'none';
  const canvas = document.createElement('canvas');
  canvasShell.appendChild(canvas);
  body.appendChild(canvasShell);

  container.appendChild(body);
  document.body.appendChild(container);

  const rect = body.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  canvas.style.width = `${rect.width}px`;
  canvas.style.height = `${rect.height}px`;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, rect.width, rect.height);
  const rectSize = { width: rect.width, height: rect.height };
  (page.strokes || []).forEach((stroke) => drawStroke(ctx, stroke, rectSize));

  const canvasImage = await html2canvas(container, {
    scale: 2,
    useCORS: true,
    backgroundColor: '#ffffff',
  });

  document.body.removeChild(container);
  return canvasImage;
};

export const exportPagesToPdf = async (pages) => {
  const pdf = new jsPDF('p', 'pt', 'a4');

  for (let i = 0; i < pages.length; i += 1) {
    if (i > 0) pdf.addPage();
    const page = pages[i];
    // eslint-disable-next-line no-await-in-loop
    const snapshot = await renderPageForExport(page);
    const imgData = snapshot.toDataURL('image/png');
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const imgWidth = pageWidth;
    const imgHeight = (snapshot.height * pageWidth) / snapshot.width;
    const yOffset = Math.max(0, (pageHeight - imgHeight) / 2);
    pdf.addImage(imgData, 'PNG', 0, yOffset, imgWidth, imgHeight);
  }

  pdf.save('xournote.pdf');
};

export default exportPagesToPdf;
