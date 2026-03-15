import { PENTOOL } from '../data/constants';

const Toolbar = ({
  inkColor,
  inkWidth,
  tool,
  onInkColorChange,
  onInkWidthChange,
  onToggleDraw,
  onToggleErase,
  onClearCanvas,
  onAddPage,
  onExportPdf,
}) => (
  <div className="toolbar">
    <div className="toolbar__left">
      <div className="title">Notebook</div>
    </div>
    <div className="toolbar__right">
      <label className="control">
        <span>Ink</span>
        <input type="color" value={inkColor} onChange={onInkColorChange} />
      </label>
      <label className="control">
        <span>Width</span>
        <input type="range" min="1" max="12" value={inkWidth} onChange={onInkWidthChange} />
      </label>
      <button type="button" className={`ghost ${tool === PENTOOL.DRAWING ? 'ghost--active' : ''}`} onClick={onToggleDraw}>
        {tool === PENTOOL.DRAWING ? 'Draw: On' : 'Draw: Off'}
      </button>
      <button type="button" className={`ghost ${tool === PENTOOL.ERASE ? 'ghost--active' : ''}`} onClick={onToggleErase}>
        Erase
      </button>
      <button type="button" className="ghost" onClick={onClearCanvas}>
        Clear ink
      </button>
      <button type="button" className="ghost" onClick={onAddPage}>
        Add page
      </button>
      <button type="button" className="primary" onClick={onExportPdf}>
        Export PDF
      </button>
    </div>
  </div>
);

export default Toolbar;
