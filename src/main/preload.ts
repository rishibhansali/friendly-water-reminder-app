import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('overlayBridge', {
  setInteractive: (interactive: boolean) =>
    ipcRenderer.send('overlay:set-interactive', interactive),
  requestHide: () => ipcRenderer.send('overlay:hide-request'),
});
