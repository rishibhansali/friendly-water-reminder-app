import { app } from 'electron';
import { createTray } from './tray';
import { startScheduler } from './timer';
import { initOverlay } from './overlay';

app.whenReady().then(() => {
  app.dock?.hide();
  createTray();
  initOverlay();
  startScheduler();
});
