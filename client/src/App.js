import React, { useCallback, useEffect, useRef, useState } from 'react';
import './App.css';

const WS_URL = process.env.REACT_APP_WS_URL || 'ws://localhost:8080';

const toCanvasPoint = (point, rect) => ({
  x: point.x * rect.width,
  y: point.y * rect.height,
});

const drawStroke = (ctx, stroke, rect) => {
  if (!stroke || !stroke.points || stroke.points.length === 0) return;
  const { color = '#0ea5e9', width = 3 } = stroke;
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

function App() {
  const [text, setText] = useState('');
  const [strokes, setStrokes] = useState([]);
  const [connectionStatus, setConnectionStatus] = useState('connecting');
  const [inkColor, setInkColor] = useState('#0ea5e9');
  const [inkWidth, setInkWidth] = useState(3);

  const wsRef = useRef(null);
  const canvasRef = useRef(null);
  const canvasShellRef = useRef(null);
  const ignoreTextSend = useRef(false);
  const isDrawingRef = useRef(false);
  const currentStrokeRef = useRef(null);
  const strokeIdsRef = useRef(new Set());
  const canvasSizeRef = useRef({ width: 0, height: 0, dpr: 1 });
  const strokesRef = useRef([]);

  const sendMessage = useCallback((payload) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
    }
  }, []);

  useEffect(() => {
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => setConnectionStatus('open');
    ws.onclose = () => setConnectionStatus('closed');
    ws.onerror = () => setConnectionStatus('error');

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        switch (message.type) {
          case 'init': {
            const incoming = message.data;
            ignoreTextSend.current = true;
            if (typeof incoming === 'string') {
              setText(incoming);
              setStrokes([]);
            } else {
              setText((incoming && incoming.text) || '');
              setStrokes(Array.isArray(incoming?.strokes) ? incoming.strokes : []);
              if (Array.isArray(incoming?.strokes)) {
                strokeIdsRef.current = new Set(incoming.strokes.map((s) => s.id));
              }
            }
            break;
          }
          case 'text:update':
          case 'update':
            ignoreTextSend.current = true;
            setText(message.data || '');
            break;
          case 'stroke:add': {
            const stroke = message.data;
            if (!stroke || strokeIdsRef.current.has(stroke.id)) break;
            strokeIdsRef.current.add(stroke.id);
            setStrokes((prev) => [...prev, stroke]);
            break;
          }
          case 'canvas:clear':
            strokeIdsRef.current = new Set();
            setStrokes([]);
            break;
          default:
            console.warn('Unhandled message type', message.type);
        }
      } catch (error) {
        console.error('Error handling message from server', error);
      }
    };

    return () => {
      ws.close();
    };
  }, []);

  useEffect(() => {
    if (ignoreTextSend.current) {
      ignoreTextSend.current = false;
      return undefined;
    }

    const handle = setTimeout(() => {
      sendMessage({ type: 'text:update', data: text });
      // compatibility with older server versions
      sendMessage({ type: 'update', data: text });
    }, 250);

    return () => clearTimeout(handle);
  }, [text, sendMessage]);

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

  const getNormalizedPoint = (event) => {
    const canvas = canvasRef.current;
    const rect = canvas?.getBoundingClientRect();
    if (!rect) return null;
    return {
      x: (event.clientX - rect.left) / rect.width,
      y: (event.clientY - rect.top) / rect.height,
    };
  };

  const startStroke = (event) => {
    const point = getNormalizedPoint(event);
    if (!point) return;
    event.preventDefault();

    const stroke = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      color: inkColor,
      width: inkWidth,
      points: [point],
    };

    isDrawingRef.current = true;
    currentStrokeRef.current = stroke;
    strokeIdsRef.current.add(stroke.id);
    if (canvasRef.current?.setPointerCapture) {
      canvasRef.current.setPointerCapture(event.pointerId);
    }

    setStrokes((prev) => [...prev, stroke]);
  };

  const extendStroke = (event) => {
    if (!isDrawingRef.current || !currentStrokeRef.current) return;
    const point = getNormalizedPoint(event);
    if (!point) return;
    event.preventDefault();

    currentStrokeRef.current.points.push(point);
    setStrokes((prev) => {
      const updated = [...prev];
      updated[updated.length - 1] = { ...currentStrokeRef.current };
      return updated;
    });
  };

  const finishStroke = (event) => {
    if (!isDrawingRef.current || !currentStrokeRef.current) return;
    if (event?.preventDefault) event.preventDefault();
    const strokeToSend = currentStrokeRef.current;

    const endPoint = event ? getNormalizedPoint(event) : null;
    if (endPoint) {
      strokeToSend.points.push(endPoint);
      setStrokes((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = { ...strokeToSend };
        return updated;
      });
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

    sendMessage({ type: 'stroke:add', data: strokeToSend });
  };

  const clearCanvas = () => {
    setStrokes([]);
    sendMessage({ type: 'canvas:clear' });
  };

  const statusLabel = {
    connecting: 'Connecting',
    open: 'Live',
    error: 'Error',
    closed: 'Disconnected',
  }[connectionStatus] || connectionStatus;

  return (
    <div className="app">
      <header className="app__header">
        <div>
          <p className="eyebrow">Xournote</p>
          <h1>Live document + canvas</h1>
          <p className="lede">Type or draw and see changes sync instantly across connected clients.</p>
        </div>
        <div className="status">
          <span className={`status__dot status__dot--${connectionStatus}`} />
          <span>{statusLabel}</span>
        </div>
      </header>

      <main className="workspace">
        <section className="panel">
          <div className="panel__header">
            <div>
              <p className="eyebrow">Text</p>
              <h2>Shared document</h2>
            </div>
            <p className="hint">Updates send after a quick pause</p>
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Start typing to sync across sessions..."
            className="text-input"
          />
        </section>

        <section className="panel">
          <div className="panel__header">
            <div>
              <p className="eyebrow">Canvas</p>
              <h2>Shared drawing board</h2>
            </div>
            <div className="controls">
              <label className="control">
                <span>Ink</span>
                <input type="color" value={inkColor} onChange={(e) => setInkColor(e.target.value)} />
              </label>
              <label className="control">
                <span>Width</span>
                <input
                  type="range"
                  min="1"
                  max="12"
                  value={inkWidth}
                  onChange={(e) => setInkWidth(Number(e.target.value))}
                />
              </label>
              <button type="button" className="ghost" onClick={clearCanvas}>Clear</button>
            </div>
          </div>

          <div
            className="canvas-shell"
            ref={canvasShellRef}
            onPointerDown={startStroke}
            onPointerMove={extendStroke}
            onPointerUp={finishStroke}
            onPointerLeave={finishStroke}
          >
            <canvas ref={canvasRef} />
            <div className="canvas-hint">Draw with mouse or stylus. Everyone sees it.</div>
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
