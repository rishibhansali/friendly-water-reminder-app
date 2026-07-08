import { useEffect, useRef, useState } from 'react';
import Lottie from 'lottie-react';
import groovyWalkCycle from './assets/groovy-walk-cycle.json';
import './overlay.css';

// Must match the CSS transition duration on .interactive-cluster in
// overlay.css, so the walk-away animation has time to finish before the
// window actually hides (main hides it right after drinkWater()/snooze()
// is called).
const EXIT_ANIMATION_MS = 2500;

declare global {
  interface Window {
    overlayBridge: {
      setInteractive: (interactive: boolean) => void;
      drinkWater: () => void;
      snooze: () => void;
      onShown: (callback: () => void) => () => void;
    };
  }
}

function Overlay() {
  const [settled, setSettled] = useState(false);
  const exitTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const playEntrance = () => {
      if (exitTimeout.current) {
        clearTimeout(exitTimeout.current);
        exitTimeout.current = null;
      }
      // Start off-screen, then settle on the next frame so the transform
      // change is a transition, not an instant jump.
      setSettled(false);
      requestAnimationFrame(() => requestAnimationFrame(() => setSettled(true)));
    };

    playEntrance(); // first-ever show (component mounts once, window is reused after)
    return window.overlayBridge.onShown(playEntrance); // every show after that
  }, []);

  function walkAwayThen(action: () => void) {
    setSettled(false); // reverses the same transition, walking back off-screen
    exitTimeout.current = setTimeout(action, EXIT_ANIMATION_MS);
  }

  return (
    <div className="overlay-root">
      {/* Hover/click listeners live on this cluster (character + buttons),
          not the surrounding container — the container fills the whole
          (mostly transparent) window, and only the actual character/button
          area should ever stop being click-through. */}
      <div
        className={`interactive-cluster ${settled ? 'settled' : ''}`}
        onMouseEnter={() => window.overlayBridge.setInteractive(true)}
        onMouseLeave={() => window.overlayBridge.setInteractive(false)}
      >
        <Lottie animationData={groovyWalkCycle} loop autoplay className="character-animation" />
        <div className="button-row">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => walkAwayThen(() => window.overlayBridge.drinkWater())}
          >
            Drink Water
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => walkAwayThen(() => window.overlayBridge.snooze())}
          >
            Snooze
          </button>
        </div>
      </div>
    </div>
  );
}

export default Overlay;
