import {DEFAULT_INK_COLOR, DEFAULT_INK_WIDTH} from '../data/constants';

export const toCanvasPoint = (point, rect) => ({
  x: point.x * rect.width,
  y: point.y * rect.height,
});

export const drawStroke = (ctx, stroke, rect) => {
  if (!stroke || !Array.isArray(stroke.points) || stroke.points.length === 0) return;
  const { color = DEFAULT_INK_COLOR, width = DEFAULT_INK_WIDTH } = stroke;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  const start = toCanvasPoint(stroke.points[0], rect);
  ctx.moveTo(start.x, start.y);
  for (let i = 1; i < stroke.points.length; i += 1) {
    const { x, y } = toCanvasPoint(stroke.points[i], rect);
    ctx.lineTo(x, y);
  }
  ctx.stroke();
};
