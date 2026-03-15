const Pager = ({ currentIndex, totalPages, onPrev, onNext }) => (
  <div className="pager">
    <button type="button" className="ghost" onClick={onPrev} disabled={currentIndex <= 0}>
      Prev
    </button>
    <span className="pager__label">
      Page {currentIndex + 1} of {totalPages}
    </span>
    <button type="button" className="ghost" onClick={onNext} disabled={currentIndex >= totalPages - 1}>
      Next
    </button>
  </div>
);

export default Pager;
