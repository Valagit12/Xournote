import { useCallback } from 'react';
import { generateId } from 'xournote-shared';
import { PENTOOL } from '../../data/constants';

const useCanvasDrawing = ({
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
} = {}) => {
  // This hook owns the pointer-to-stroke pipeline: normalize pointer coordinates,
  // update local state, and broadcast changes to collaborators. It is deliberately
  // UI-agnostic so NotebookPage can focus on layout and wiring.

  const getNormalizedPoint = useCallback(
    (event) => {
      // Convert pointer coordinates (client pixels) to normalized 0–1 space relative
      // to the canvas bounds. 
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return null;
      return {
        x: (event.clientX - rect.left) / rect.width,
        y: (event.clientY - rect.top) / rect.height,
      };
    },
    [canvasRef],
  );

  const startStroke = useCallback(
    (event) => {
      if (tool !== PENTOOL.DRAWING) return;
      const point = getNormalizedPoint(event);
      if (!point) return;
      event.preventDefault();

      const stroke = {
        id: generateId('stroke'),
        color: inkColor,
        width: inkWidth,
        points: [point],
      };

      isDrawingRef.current = true;
      currentStrokeRef.current = stroke;

      ensureStrokeSet(currentPageId).add(stroke.id);
      appendStroke(currentPageId, stroke);

      if (canvasRef.current?.setPointerCapture) {
        canvasRef.current.setPointerCapture(event.pointerId);
      }
    },
    [
      appendStroke,
      canvasRef,
      currentPageId,
      currentStrokeRef,
      ensureStrokeSet,
      getNormalizedPoint,
      inkColor,
      inkWidth,
      isDrawingRef,
      tool,
    ],
  );

  const extendStroke = useCallback(
    (event) => {
      if (tool !== PENTOOL.DRAWING || !isDrawingRef.current || !currentStrokeRef.current) return;
      const point = getNormalizedPoint(event);
      if (!point) return;
      event.preventDefault();

      currentStrokeRef.current.points.push(point);
      replaceLatestStroke(currentPageId, { ...currentStrokeRef.current });
    },
    [currentPageId, currentStrokeRef, getNormalizedPoint, isDrawingRef, replaceLatestStroke, tool],
  );

  const finishStroke = useCallback(
    (event) => {
      if (tool !== PENTOOL.DRAWING || !isDrawingRef.current || !currentStrokeRef.current) return;
      if (event?.preventDefault) event.preventDefault();
      const strokeToSend = currentStrokeRef.current;

      const endPoint = event ? getNormalizedPoint(event) : null;
      if (endPoint) {
        strokeToSend.points.push(endPoint);
        replaceLatestStroke(currentPageId, { ...strokeToSend });
      }

      isDrawingRef.current = false;
      currentStrokeRef.current = null;

      if (canvasRef.current?.releasePointerCapture) {
        try {
          canvasRef.current.releasePointerCapture(event.pointerId);
        } catch (_) {
          // ignore release errors 
        }
      }

      sendMessage({ type: 'stroke:add', pageId: currentPageId, data: strokeToSend });
    },
    [
      canvasRef,
      currentPageId,
      currentStrokeRef,
      getNormalizedPoint,
      isDrawingRef,
      replaceLatestStroke,
      sendMessage,
      tool,
    ],
  );

  const eraseStrokeAtPoint = useCallback(
    (event) => {
      const point = getNormalizedPoint(event);
      if (!point) return;
      const { width, height } = canvasSizeRef.current;
      if (!width || !height) return;
      const px = point.x * width;
      const py = point.y * height;
      const threshold = 12;

      const distanceToStroke = (stroke) => {
        if (!stroke.points || stroke.points.length === 0) return Infinity;
        let min = Infinity;
        for (let i = 0; i < stroke.points.length - 1; i += 1) {
          const a = stroke.points[i];
          const b = stroke.points[i + 1];
          const ax = a.x * width;
          const ay = a.y * height;
          const bx = b.x * width;
          const by = b.y * height;
          const dx = bx - ax;
          const dy = by - ay;
          const lenSq = dx * dx + dy * dy || 1;
          const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
          const projX = ax + t * dx;
          const projY = ay + t * dy;
          const dist = Math.hypot(px - projX, py - projY);
          if (dist < min) min = dist;
        }
        return min;
      };

      const target = [...strokes].reverse().find((stroke) => distanceToStroke(stroke) <= threshold);
      if (!target) return;

      // Remove locally first, then notify collaborators.
      ensureStrokeSet(currentPageId).delete(target.id);
      removeStroke(currentPageId, target.id);
      sendMessage({ type: 'stroke:remove', pageId: currentPageId, strokeId: target.id, data: { id: target.id } });
    },
    [canvasSizeRef, currentPageId, ensureStrokeSet, getNormalizedPoint, removeStroke, sendMessage, strokes],
  );

  const clearCanvas = useCallback(() => {
    ensureStrokeSet(currentPageId).clear();
    clearPageStrokes(currentPageId);
    sendMessage({ type: 'canvas:clear', pageId: currentPageId });
  }, [clearPageStrokes, currentPageId, ensureStrokeSet, sendMessage]);

  const handlePointerDown = useCallback(
    (event) => {
      if (tool === PENTOOL.ERASE) {
        const isLeft = typeof event.buttons === 'number' ? (event.buttons & 1) === 1 : event.button === 0;
        if (!isLeft) return;
        event.preventDefault();
        eraseStrokeAtPoint(event);
      } else {
        startStroke(event);
      }
    },
    [eraseStrokeAtPoint, startStroke, tool],
  );

  const handlePointerMove = useCallback(
    (event) => {
      if (tool === PENTOOL.ERASE) {
        const isLeft = typeof event.buttons === 'number' ? (event.buttons & 1) === 1 : event.button === 0;
        if (!isLeft) return;
        event.preventDefault();
        eraseStrokeAtPoint(event);
      } else {
        extendStroke(event);
      }
    },
    [eraseStrokeAtPoint, extendStroke, tool],
  );

  const handlePointerUp = useCallback(
    (event) => {
      if (tool === PENTOOL.ERASE) {
        const isLeft = event.button === 0 || (typeof event.buttons === 'number' ? (event.buttons & 1) === 1 : false);
        if (!isLeft) return;
        event.preventDefault();
        eraseStrokeAtPoint(event);
      } else {
        finishStroke(event);
      }
    },
    [eraseStrokeAtPoint, finishStroke, tool],
  );

  const handlePointerLeave = useCallback(
    (event) => {
      // if the pointer leaves mid-draw, close the stroke to avoid dangling state.
      if (tool !== PENTOOL.ERASE) {
        finishStroke(event);
      }
    },
    [finishStroke, tool],
  );

  return {
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerLeave,
    clearCanvas,
  };
};

export default useCanvasDrawing;
