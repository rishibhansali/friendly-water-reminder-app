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
