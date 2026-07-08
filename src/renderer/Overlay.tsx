import './overlay.css';

declare global {
  interface Window {
    overlayBridge: {
      setInteractive: (interactive: boolean) => void;
      drinkWater: () => void;
      snooze: () => void;
      openSettings: () => void;
    };
  }
}

function Overlay() {
  return (
    <div className="overlay-root">
      {/* Hover/click listeners live on this cluster (character + buttons),
          not the surrounding container — the container fills the whole
          (mostly transparent) window, and only the actual character/button
          area should ever stop being click-through. */}
      <div
        className="interactive-cluster"
        onMouseEnter={() => window.overlayBridge.setInteractive(true)}
        onMouseLeave={() => window.overlayBridge.setInteractive(false)}
      >
        <div className="placeholder-character" />
        <div className="button-row">
          <button type="button" onClick={() => window.overlayBridge.drinkWater()}>
            Drink Water
          </button>
          <button type="button" onClick={() => window.overlayBridge.snooze()}>
            Snooze
          </button>
          <button type="button" onClick={() => window.overlayBridge.openSettings()}>
            Settings
          </button>
        </div>
      </div>
    </div>
  );
}

export default Overlay;
