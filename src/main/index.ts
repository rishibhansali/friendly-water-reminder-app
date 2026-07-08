import { app } from 'electron';
import { createTray } from './tray';
import { startScheduler } from './timer';

app.whenReady().then(() => {
  app.dock?.hide();
  createTray();
  startScheduler();
});
