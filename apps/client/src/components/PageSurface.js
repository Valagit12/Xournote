import { PENTOOL } from '../data/constants';

const PageSurface = ({
  text,
  onTextChange,
  tool,
  canvasRef,
  canvasShellRef,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerLeave,
}) => (
  <div className="page-shell">
    <div className="page">
      <div className="page__body">
        <textarea
          value={text}
          onChange={(event) => onTextChange(event.target.value)}
          placeholder="Start typing..."
          className="text-input"
        />

        <div
          className="canvas-shell"
          ref={canvasShellRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerLeave}
          onContextMenu={(event) => event.preventDefault()}
          style={{ pointerEvents: tool === PENTOOL.OFF ? 'none' : 'auto' }}
        >
          <canvas ref={canvasRef} />
        </div>
      </div>
    </div>
  </div>
);

export default PageSurface;
