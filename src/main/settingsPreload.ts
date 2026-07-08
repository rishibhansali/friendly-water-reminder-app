import { contextBridge, ipcRenderer } from 'electron';
import type { EditableSettings } from '../shared/types';

contextBridge.exposeInMainWorld('settingsBridge', {
  getSettings: (): Promise<EditableSettings> => ipcRenderer.invoke('settings:get'),
  setReminderInterval: (minutes: number) =>
    ipcRenderer.send('settings:set-reminder-interval', minutes),
  setDailyGoal: (ml: number) => ipcRenderer.send('settings:set-daily-goal', ml),
  setLaunchAtLogin: (enabled: boolean) => ipcRenderer.send('settings:set-launch-at-login', enabled),
});
