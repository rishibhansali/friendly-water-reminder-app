import { BrowserWindow, ipcMain, screen } from 'electron';
import path from 'node:path';
import { registerFireHandler, drinkWater, snooze } from './timer';
import { recordDrink } from './progress';

const WINDOW_WIDTH = 320;
const WINDOW_HEIGHT = 260;
const EDGE_MARGIN = 20;

// Real fallback (not a stand-in): auto-hides the overlay if the user ignores
// it entirely, since there's no other time limit on how long it stays up.
const AUTO_HIDE_MS = 30_000;

let overlayWindow: BrowserWindow | null = null;
let autoHideTimeout: NodeJS.Timeout | null = null;

function bottomRightPosition(): { x: number; y: number } {
  const { workArea } = screen.getPrimaryDisplay();
  return {
    x: workArea.x + workArea.width - WINDOW_WIDTH - EDGE_MARGIN,
    y: workArea.y + workArea.height - WINDOW_HEIGHT - EDGE_MARGIN,
  };
}

function createOverlayWindow(): BrowserWindow {
  const { x, y } = bottomRightPosition();
  const win = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    x,
    y,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const devServerUrl = process.env.ELECTRON_RENDERER_URL;
  if (devServerUrl) {
    win.loadURL(devServerUrl);
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  return win;
}

function clearAutoHide(): void {
  if (autoHideTimeout) {
    clearTimeout(autoHideTimeout);
    autoHideTimeout = null;
  }
}

function hideOverlay(): void {
  console.log('[overlay] Hiding overlay window.');
  clearAutoHide();
  overlayWindow?.hide();
}

function showOverlay(): void {
  console.log('[overlay] Showing overlay window.');
  if (!overlayWindow) {
    overlayWindow = createOverlayWindow();
  }

  // Always reset to click-through before showing, in case the window was
  // hidden while the cursor happened to be over the interactive area (e.g.
  // the auto-hide timeout firing mid-hover) — don't assume mouseleave
  // already ran and left the window in the right state.
  overlayWindow.setIgnoreMouseEvents(true, { forward: true });

  const { x, y } = bottomRightPosition();
  overlayWindow.setPosition(x, y);
  overlayWindow.show();

  // The window is hidden/reused, never reloaded, so the renderer only ever
  // mounts once — this tells it "you're visible again" so it can replay the
  // walk-in animation on every show, not just the first.
  overlayWindow.webContents.send('overlay:shown');

  clearAutoHide();
  autoHideTimeout = setTimeout(hideOverlay, AUTO_HIDE_MS);
}

export function initOverlay(): void {
  ipcMain.on('overlay:set-interactive', (_event, interactive: boolean) => {
    console.log(`[overlay] set-interactive: ${interactive}`);
    overlayWindow?.setIgnoreMouseEvents(!interactive, { forward: true });
  });

  ipcMain.on('overlay:drink-water', () => {
    console.log('[overlay] Drink Water clicked.');
    recordDrink();
    drinkWater();
    hideOverlay();
  });

  ipcMain.on('overlay:snooze', () => {
    console.log('[overlay] Snooze clicked.');
    snooze();
    hideOverlay();
  });

  registerFireHandler(showOverlay);
}
