import { useCallback, useEffect, useRef, useState } from 'react';
import { WS_BASE_URL, CONNECTIONSTATUS } from '../../data/constants';
import { createPage } from '../../utils/page';
import { generateId, parseIncomingMessage, parseOutgoingMessage } from 'xournote-shared';

const getActivePageId = (pageIdFromMessage, fallbackRef) => pageIdFromMessage ?? fallbackRef?.current;

const useRealtimeSync = ({
  notebookId,
  onInit,
  onPageAdd,
  onTextUpdate,
  onStrokeAdd,
  onStrokeRemove,
  onCanvasClear,
  onNotebookCreated,
  onNotebookNotFound,
  onNotebookLimitReached,
  currentPageIdRef,
} = {}) => {
  const [connectionStatus, setConnectionStatus] = useState(CONNECTIONSTATUS.CONNECTING);
  const wsRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef(null);
  const shouldReconnectRef = useRef(true);
  const handlersRef = useRef({
    onInit, onPageAdd, onTextUpdate, onStrokeAdd, onStrokeRemove, onCanvasClear,
    onNotebookCreated, onNotebookNotFound, onNotebookLimitReached,
  });

  useEffect(() => {
    handlersRef.current = {
      onInit, onPageAdd, onTextUpdate, onStrokeAdd, onStrokeRemove, onCanvasClear,
      onNotebookCreated, onNotebookNotFound, onNotebookLimitReached,
    };
  }, [onInit, onPageAdd, onTextUpdate, onStrokeAdd, onStrokeRemove, onCanvasClear,
      onNotebookCreated, onNotebookNotFound, onNotebookLimitReached]);

  const sendMessage = useCallback((payload) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      const parsed = parseOutgoingMessage(payload);
      if (!parsed.success) {
        // eslint-disable-next-line no-console
        console.warn('Dropping outbound message: invalid shape', parsed.error.format());
        return;
      }
      ws.send(JSON.stringify(parsed.data));
    }
  }, []);

  useEffect(() => {
    shouldReconnectRef.current = true;
    reconnectAttemptsRef.current = 0;

    const cleanup = () => {
      shouldReconnectRef.current = false;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };

    const wsUrlRef = { current: notebookId
      ? `${WS_BASE_URL}?notebook=${notebookId}`
      : WS_BASE_URL };

    const setupWebSocket = () => {
      if (!shouldReconnectRef.current) return;
      setConnectionStatus(CONNECTIONSTATUS.CONNECTING);
      const ws = new WebSocket(wsUrlRef.current);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!shouldReconnectRef.current) return;
        reconnectAttemptsRef.current = 0;
        setConnectionStatus(CONNECTIONSTATUS.OPEN);
      };

      ws.onclose = () => {
        if (!shouldReconnectRef.current) return;
        setConnectionStatus(CONNECTIONSTATUS.CLOSED);
        const delay = Math.min(5000, 500 * 2 ** reconnectAttemptsRef.current);
        reconnectAttemptsRef.current += 1;
        reconnectTimerRef.current = setTimeout(setupWebSocket, delay);
        wsRef.current = null;
      };

      ws.onerror = () => {
        if (!shouldReconnectRef.current) return;
        setConnectionStatus(CONNECTIONSTATUS.ERROR);
        ws.close();
        wsRef.current = null;
      };

      ws.onmessage = (event) => {
        if (!shouldReconnectRef.current) return;
        try {
          const rawMessage = JSON.parse(event.data);
          const parsed = parseIncomingMessage(rawMessage);
          if (!parsed.success) {
            // eslint-disable-next-line no-console
            console.warn('Dropping inbound message: invalid shape', parsed.error.format());
            return;
          }
          const message = parsed.data;
          const activePageId = getActivePageId(message.pageId, currentPageIdRef);
          const handlers = handlersRef.current;

          switch (message.type) {
            case 'notebook:status': {
              if (message.status === 'created') {
                wsUrlRef.current = `${WS_BASE_URL}?notebook=${message.data.id}`;
                handlers.onNotebookCreated?.(message.data.id);
              } else if (message.status === 'not_found') {
                shouldReconnectRef.current = false;
                handlers.onNotebookNotFound?.();
              } else if (message.status === 'limit_reached') {
                shouldReconnectRef.current = false;
                handlers.onNotebookLimitReached?.();
              }
              break;
            }
            case 'init': {
              handlers.onInit?.(message.data);
              break;
            }
            case 'page:add': {
              const page = message.data && message.data.id ? message.data : createPage(generateId('page'));
              handlers.onPageAdd?.(page);
              break;
            }
            case 'text:update': {
              if (typeof message.data !== 'string') break;
              handlers.onTextUpdate?.(activePageId, message.data);
              break;
            }
            case 'stroke:add': {
              if (!message.data) break;
              handlers.onStrokeAdd?.(activePageId, message.data);
              break;
            }
            case 'stroke:remove': {
              const strokeId = message.strokeId || (message.data && message.data.id);
              if (!strokeId) break;
              handlers.onStrokeRemove?.(activePageId, strokeId);
              break;
            }
            case 'canvas:clear': {
              handlers.onCanvasClear?.(activePageId);
              break;
            }
            default:
              // eslint-disable-next-line no-console
              console.warn('Unhandled message type', message.type);
          }
        } catch (error) {
          // eslint-disable-next-line no-console
          console.error('Error handling message from server', error);
        }
      };
    };

    setupWebSocket();
    return cleanup;
  }, [notebookId, currentPageIdRef]);

  return { connectionStatus, sendMessage };
};

export default useRealtimeSync;
