import { app } from 'electron';
import { createTray } from './tray';
import { startScheduler } from './timer';
import { initOverlay } from './overlay';
import { initSettings } from './settings';

app.whenReady().then(() => {
  app.dock?.hide();
  initSettings();
  createTray();
  initOverlay();
  startScheduler();
});

// Menu-bar utility: the tray icon is the app's real lifetime, not any window.
// Without this, closing the Settings window while the overlay hasn't been
// created yet (e.g. Settings opened before any reminder has ever fired)
// would hit Electron's default "quit when all windows are closed" behavior
// and silently kill the whole app, tray icon included. Only Quit (from the
// tray menu) should actually exit.
app.on('window-all-closed', () => {});
