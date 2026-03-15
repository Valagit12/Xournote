const statusLabels = {
  connecting: 'Connecting',
  open: 'Live',
  error: 'Error',
  closed: 'Disconnected',
};

const AppHeader = ({ connectionStatus }) => {
  const label = statusLabels[connectionStatus] || connectionStatus;

  return (
    <header className="app__header">
      <div>
        <p className="eyebrow">Xournote</p>
        <h1>Live document & canvas</h1>
        <p className="lede">Type and draw on the same page, synced in real time.</p>
      </div>
      <div className="status">
        <span className={`status__dot status__dot--${connectionStatus}`} />
        <span>{label}</span>
      </div>
    </header>
  );
};

export default AppHeader;
