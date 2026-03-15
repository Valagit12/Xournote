export const WS_URL = process.env.REACT_APP_WS_URL || 'ws://localhost:8080';

export const TEXT_UPDATE_DEBOUNCE_MS = 250;

export const DEFAULT_INK_COLOR = '#0ea5e9';

export const DEFAULT_INK_WIDTH = 3;

export const CONNECTIONSTATUS = Object.freeze({
  CONNECTING: 'connecting',
  OPEN: 'open',
  CLOSED: 'closed',
  ERROR: 'error'
})

export const PENTOOL = Object.freeze({
  OFF: "off",
  DRAWING: "draw",
  ERASE: "erase"
})
