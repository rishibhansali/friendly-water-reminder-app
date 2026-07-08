import { app } from 'electron';
import { createTray } from './tray';

app.whenReady().then(() => {
  app.dock?.hide();
  createTray();
});
