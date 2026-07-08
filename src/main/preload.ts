import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('overlayBridge', {
  setInteractive: (interactive: boolean) =>
    ipcRenderer.send('overlay:set-interactive', interactive),
  drinkWater: () => ipcRenderer.send('overlay:drink-water'),
  snooze: () => ipcRenderer.send('overlay:snooze'),
  onShown: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on('overlay:shown', listener);
    return () => ipcRenderer.removeListener('overlay:shown', listener);
  },
});
