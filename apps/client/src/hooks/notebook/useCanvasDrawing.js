import { useCallback, useEffect, useRef } from 'react';
import { generateId } from 'xournote-shared';
import { PENTOOL } from '../../data/constants';
import { drawStroke, toCanvasPoint } from '../../utils/drawing';

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
  removeStroke,
  clearPageStrokes,
  sendMessage,
} = {}) => {
  const queuedPointsRef = useRef([]);
  const lastRenderedPointRef = useRef(null);
  const activeStrokeRectRef = useRef(null);
  const activeDrawingPointerIdRef = useRef(null);
  const activeDrawingPointerTypeRef = useRef(null);
  const activeTouchPointersRef = useRef(new Set());
  const isMultiTouchGestureRef = useRef(false);
  const frameRef = useRef(null);

  const isSecondaryTouchPointer = useCallback(
    (event) => event.pointerType === 'touch' && event.isPrimary === false,
    [],
  );

  const registerTouchPointerDown = useCallback((event) => {
    if (event.pointerType !== 'touch') return false;
    activeTouchPointersRef.current.add(event.pointerId);
    if (activeTouchPointersRef.current.size > 1) {
      isMultiTouchGestureRef.current = true;
    }
    return isMultiTouchGestureRef.current;
  }, []);

  const releaseTouchPointer = useCallback((event) => {
    if (event.pointerType !== 'touch') return;
    activeTouchPointersRef.current.delete(event.pointerId);
    if (activeTouchPointersRef.current.size === 0) {
      isMultiTouchGestureRef.current = false;
    }
  }, []);

  const clearRenderQueue = useCallback(() => {
    queuedPointsRef.current = [];
    lastRenderedPointRef.current = null;
    activeStrokeRectRef.current = null;
  }, []);

  const getNormalizedPoint = useCallback(
    (event, rectOverride) => {
      const rect = rectOverride || activeStrokeRectRef.current || canvasRef.current?.getBoundingClientRect();
      if (!rect || !rect.width || !rect.height) return null;
      const x = (event.clientX - rect.left) / rect.width;
      const y = (event.clientY - rect.top) / rect.height;
      return {
        x: Math.max(0, Math.min(1, x)),
        y: Math.max(0, Math.min(1, y)),
      };
    },
    [canvasRef],
  );

  const flushQueuedStrokeSegments = useCallback(() => {
    const stroke = currentStrokeRef.current;
    const pendingPoints = queuedPointsRef.current;
    if (!stroke || pendingPoints.length === 0) return;

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext?.('2d');
    const { width, height } = canvasSizeRef.current;
    if (!ctx || !width || !height) return;

    const rect = { width, height };
    const fromPoint = lastRenderedPointRef.current || stroke.points[0];
    if (!fromPoint) return;

    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = stroke.width;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();

    const start = toCanvasPoint(fromPoint, rect);
    ctx.moveTo(start.x, start.y);

    let drewSegment = false;
    pendingPoints.forEach((point) => {
      const next = toCanvasPoint(point, rect);
      ctx.lineTo(next.x, next.y);
      drewSegment = true;
    });

    if (!drewSegment) {
      ctx.lineTo(start.x, start.y);
    }

    ctx.stroke();

    lastRenderedPointRef.current = pendingPoints[pendingPoints.length - 1] || fromPoint;
    queuedPointsRef.current = [];
  }, [canvasRef, canvasSizeRef, currentStrokeRef]);

  const scheduleQueuedStrokeRender = useCallback(() => {
    if (frameRef.current !== null) return;
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;
      flushQueuedStrokeSegments();
    });
  }, [flushQueuedStrokeSegments]);

  const queuePointsFromEvent = useCallback(
    (event, rectOverride) => {
      const stroke = currentStrokeRef.current;
      if (!stroke) return false;

      const sampledEvents =
        typeof event.getCoalescedEvents === 'function' ? event.getCoalescedEvents() : [event];
      let didQueue = false;

      sampledEvents.forEach((sample) => {
        const point = getNormalizedPoint(sample, rectOverride);
        if (!point) return;

        const lastPoint = stroke.points[stroke.points.length - 1];
        if (lastPoint && point.x === lastPoint.x && point.y === lastPoint.y) {
          return;
        }

        stroke.points.push(point);
        queuedPointsRef.current.push(point);
        didQueue = true;
      });

      if (didQueue) {
        scheduleQueuedStrokeRender();
      }

      return didQueue;
    },
    [currentStrokeRef, getNormalizedPoint, scheduleQueuedStrokeRender],
  );

  useEffect(
    () => () => {
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
      }
    },
    [],
  );

  const redrawCommittedStrokes = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext?.('2d');
    const { width, height, dpr = 1 } = canvasSizeRef.current;
    if (!ctx || !width || !height) return;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);
    const rect = { width, height };
    strokes.forEach((stroke) => drawStroke(ctx, stroke, rect));
  }, [canvasRef, canvasSizeRef, strokes]);

  const abortStroke = useCallback(
    (event) => {
      if (!isDrawingRef.current || !currentStrokeRef.current) return;

      const activePointerId = activeDrawingPointerIdRef.current;

      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }

      isDrawingRef.current = false;
      currentStrokeRef.current = null;
      activeDrawingPointerIdRef.current = null;
      activeDrawingPointerTypeRef.current = null;
      clearRenderQueue();

      const pointerIdToRelease = event?.pointerId ?? activePointerId;
      if (canvasRef.current?.releasePointerCapture && pointerIdToRelease !== undefined && pointerIdToRelease !== null) {
        try {
          canvasRef.current.releasePointerCapture(pointerIdToRelease);
        } catch (_) {
          // ignore release errors
        }
      }

      redrawCommittedStrokes();
    },
    [canvasRef, clearRenderQueue, currentStrokeRef, isDrawingRef, redrawCommittedStrokes],
  );

  const startStroke = useCallback(
    (event) => {
      if (tool !== PENTOOL.DRAWING) return;
      if (isSecondaryTouchPointer(event)) return;
      if (isDrawingRef.current || currentStrokeRef.current) return;

      const isPrimary = event.button === 0 || (typeof event.buttons === 'number' ? (event.buttons & 1) === 1 : true);
      if (!isPrimary) return;

      const rect = canvasRef.current?.getBoundingClientRect();
      const point = getNormalizedPoint(event, rect);
      if (!point) return;
      event.preventDefault();

      clearRenderQueue();
      activeStrokeRectRef.current = rect;

      const stroke = {
        id: generateId('stroke'),
        color: inkColor,
        width: inkWidth,
        points: [point],
      };

      isDrawingRef.current = true;
      currentStrokeRef.current = stroke;
      activeDrawingPointerIdRef.current = event.pointerId;
      activeDrawingPointerTypeRef.current = event.pointerType;

      queuedPointsRef.current.push(point);
      scheduleQueuedStrokeRender();

      if (event.pointerType !== 'touch' && canvasRef.current?.setPointerCapture) {
        canvasRef.current.setPointerCapture(event.pointerId);
      }
    },
    [
      activeDrawingPointerIdRef,
      activeDrawingPointerTypeRef,
      canvasRef,
      clearRenderQueue,
      currentStrokeRef,
      getNormalizedPoint,
      inkColor,
      inkWidth,
      isSecondaryTouchPointer,
      isDrawingRef,
      scheduleQueuedStrokeRender,
      tool,
    ],
  );

  const extendStroke = useCallback(
    (event) => {
      if (tool !== PENTOOL.DRAWING || !isDrawingRef.current || !currentStrokeRef.current) return;

      if (event.pointerType === 'touch' && isMultiTouchGestureRef.current) {
        if (activeDrawingPointerTypeRef.current === 'touch') {
          abortStroke(event);
        }
        return;
      }

      if (isSecondaryTouchPointer(event)) return;
      if (activeDrawingPointerIdRef.current !== null && event.pointerId !== activeDrawingPointerIdRef.current) return;
      event.preventDefault();

      queuePointsFromEvent(event, activeStrokeRectRef.current);
    },
    [
      abortStroke,
      activeDrawingPointerIdRef,
      activeDrawingPointerTypeRef,
      currentStrokeRef,
      isDrawingRef,
      isSecondaryTouchPointer,
      queuePointsFromEvent,
      tool,
    ],
  );

  const finishStroke = useCallback(
    (event) => {
      if (tool !== PENTOOL.DRAWING || !isDrawingRef.current || !currentStrokeRef.current) return;

      if (event?.pointerType === 'touch' && isMultiTouchGestureRef.current && activeDrawingPointerTypeRef.current === 'touch') {
        abortStroke(event);
        return;
      }

      if (isSecondaryTouchPointer(event)) return;

      const activePointerId = activeDrawingPointerIdRef.current;
      if (event?.pointerId !== undefined && activePointerId !== null && event.pointerId !== activePointerId) return;

      if (event?.preventDefault) event.preventDefault();

      if (event) {
        queuePointsFromEvent(event, activeStrokeRectRef.current);
      }

      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }

      flushQueuedStrokeSegments();

      const strokeToSend = {
        ...currentStrokeRef.current,
        points: [...currentStrokeRef.current.points],
      };

      if (strokeToSend.points.length > 0) {
        ensureStrokeSet(currentPageId).add(strokeToSend.id);
        appendStroke(currentPageId, strokeToSend);
        sendMessage({ type: 'stroke:add', pageId: currentPageId, data: strokeToSend });
      }

      isDrawingRef.current = false;
      currentStrokeRef.current = null;
      activeDrawingPointerIdRef.current = null;
      activeDrawingPointerTypeRef.current = null;
      clearRenderQueue();

      const pointerIdToRelease = event?.pointerId ?? activePointerId;
      if (canvasRef.current?.releasePointerCapture && pointerIdToRelease !== undefined && pointerIdToRelease !== null) {
        try {
          canvasRef.current.releasePointerCapture(pointerIdToRelease);
        } catch (_) {
          // ignore release errors
        }
      }
    },
    [
      activeDrawingPointerIdRef,
      activeDrawingPointerTypeRef,
      appendStroke,
      abortStroke,
      canvasRef,
      clearRenderQueue,
      currentPageId,
      currentStrokeRef,
      ensureStrokeSet,
      flushQueuedStrokeSegments,
      isDrawingRef,
      isSecondaryTouchPointer,
      queuePointsFromEvent,
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
    if (frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    isDrawingRef.current = false;
    currentStrokeRef.current = null;
    activeDrawingPointerIdRef.current = null;
    activeDrawingPointerTypeRef.current = null;
    activeTouchPointersRef.current.clear();
    isMultiTouchGestureRef.current = false;
    clearRenderQueue();

    ensureStrokeSet(currentPageId).clear();
    clearPageStrokes(currentPageId);
    sendMessage({ type: 'canvas:clear', pageId: currentPageId });
  }, [
    activeDrawingPointerIdRef,
    activeDrawingPointerTypeRef,
    clearPageStrokes,
    clearRenderQueue,
    currentPageId,
    currentStrokeRef,
    ensureStrokeSet,
    isDrawingRef,
    sendMessage,
  ]);

  const handlePointerDown = useCallback(
    (event) => {
      const shouldUseMultiTouchGesture = registerTouchPointerDown(event);
      if (shouldUseMultiTouchGesture) {
        if (activeDrawingPointerTypeRef.current === 'touch') {
          abortStroke(event);
        }
        return;
      }

      if (isSecondaryTouchPointer(event)) return;

      if (tool === PENTOOL.ERASE) {
        const isLeft = typeof event.buttons === 'number' ? (event.buttons & 1) === 1 : event.button === 0;
        if (!isLeft) return;
        event.preventDefault();
        eraseStrokeAtPoint(event);
      } else {
        startStroke(event);
      }
    },
    [abortStroke, activeDrawingPointerTypeRef, eraseStrokeAtPoint, isSecondaryTouchPointer, registerTouchPointerDown, startStroke, tool],
  );

  const handlePointerMove = useCallback(
    (event) => {
      if (event.pointerType === 'touch' && isMultiTouchGestureRef.current) {
        if (activeDrawingPointerTypeRef.current === 'touch') {
          abortStroke(event);
        }
        return;
      }

      if (isSecondaryTouchPointer(event)) return;

      if (tool === PENTOOL.ERASE) {
        const isLeft = typeof event.buttons === 'number' ? (event.buttons & 1) === 1 : event.button === 0;
        if (!isLeft) return;
        event.preventDefault();
        eraseStrokeAtPoint(event);
      } else {
        extendStroke(event);
      }
    },
    [abortStroke, activeDrawingPointerTypeRef, eraseStrokeAtPoint, extendStroke, isSecondaryTouchPointer, tool],
  );

  const handlePointerUp = useCallback(
    (event) => {
      const wasMultiTouchGesture = event.pointerType === 'touch' && isMultiTouchGestureRef.current;
      releaseTouchPointer(event);

      if (wasMultiTouchGesture) {
        if (activeDrawingPointerTypeRef.current === 'touch') {
          abortStroke(event);
        }
        return;
      }

      if (isSecondaryTouchPointer(event)) return;

      if (tool === PENTOOL.ERASE) {
        const isLeft = event.button === 0 || (typeof event.buttons === 'number' ? (event.buttons & 1) === 1 : false);
        if (!isLeft) return;
        event.preventDefault();
        eraseStrokeAtPoint(event);
      } else {
        finishStroke(event);
      }
    },
    [abortStroke, activeDrawingPointerTypeRef, eraseStrokeAtPoint, finishStroke, isSecondaryTouchPointer, releaseTouchPointer, tool],
  );

  const handlePointerLeave = useCallback(
    (event) => {
      if (tool !== PENTOOL.ERASE) {
        if (event.pointerType === 'touch' && isMultiTouchGestureRef.current && activeDrawingPointerTypeRef.current === 'touch') {
          abortStroke(event);
          return;
        }
        finishStroke(event);
      }
    },
    [abortStroke, activeDrawingPointerTypeRef, finishStroke, tool],
  );

  const handlePointerCancel = useCallback(
    (event) => {
      const wasMultiTouchGesture = event.pointerType === 'touch' && isMultiTouchGestureRef.current;
      releaseTouchPointer(event);

      if (wasMultiTouchGesture) {
        if (activeDrawingPointerTypeRef.current === 'touch') {
          abortStroke(event);
        }
        return;
      }

      if (tool !== PENTOOL.ERASE) {
        if (event.pointerType === 'touch' && isMultiTouchGestureRef.current && activeDrawingPointerTypeRef.current === 'touch') {
          abortStroke(event);
          return;
        }
        finishStroke(event);
      }
    },
    [abortStroke, activeDrawingPointerTypeRef, finishStroke, releaseTouchPointer, tool],
  );

  return {
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerLeave,
    handlePointerCancel,
    clearCanvas,
  };
};

export default useCanvasDrawing;
