import './overlay.css';

declare global {
  interface Window {
    overlayBridge: {
      setInteractive: (interactive: boolean) => void;
      requestHide: () => void;
    };
  }
}

function Overlay() {
  return (
    <div className="overlay-root">
      {/* Hover/click listeners live on the visible box itself, not the
          surrounding container — the container fills the whole (mostly
          transparent) window, and only the actual character/button area
          should ever stop being click-through. */}
      <div
        className="placeholder-character"
        onMouseEnter={() => window.overlayBridge.setInteractive(true)}
        onMouseLeave={() => window.overlayBridge.setInteractive(false)}
        // TEMPORARY: clicking the placeholder stands in for the real Drink
        // Water / Snooze / Settings buttons, which land in the next task.
        onClick={() => window.overlayBridge.requestHide()}
      />
    </div>
  );
}

export default Overlay;
