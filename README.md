# ✍️ Xournote

Lightweight web notepad with live text + ink sync over WebSockets. No persistence by design (state is in-memory on the server).

## What’s here

- Shared pages with typing and freehand strokes on one surface
- Multi-page support (add/prev/next)
- Stroke-level eraser (remove entire stroke), clear-ink per page
- PDF export (captures text + ink per page)
- Reconnect/backoff client, basic validation + heartbeat on server

## Quick start

```bash
# install once at repo root
npm install

# backend (apps/server)
npm run server

# frontend (apps/client)
npm run client        # set PORT=3001 for a second client
```

Open the app in two tabs; type or draw and see changes sync. Use the toolbar to toggle Draw/Erase, clear ink, add pages, and export to PDF.

## Environment

- WebSocket URL: `REACT_APP_WS_URL` (defaults to `ws://localhost:8080`)
- Allowed origins (server, optional): `ALLOWED_ORIGINS` as a comma-separated list

## Notes & limits

- No persistence: restarting the server resets all pages/text/strokes.
- Security: no auth/ACL; any client that can reach the WebSocket can read/write. Set `ALLOWED_ORIGINS` for basic origin filtering; TLS/real auth are not provided.
- Payload guard: messages over ~200KB are dropped; strokes are validated server-side.
- Export: uses `html2canvas` + `jsPDF`; fidelity is “good enough” for notes but not print-perfect.

## Message types (WebSocket)

- `init { data: { pages: [{ id, text, strokes }] } }`
- `page:add { data: { id, text, strokes } }`
- `text:update | update { pageId, data: string }`
- `stroke:add { pageId, data: { id, points[{x,y}], color, width } }`
- `stroke:remove { pageId, strokeId }`
- `canvas:clear { pageId }`

Unknown/invalid messages are ignored; oversize payloads are dropped.
