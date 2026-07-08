import { BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import { settingsStore } from './store';
import { applyLaunchAtLogin } from './launch-at-login';
import { getTodaysProgress } from './progress';
import type { EditableSettings, TodaysProgress } from '../shared/types';

let settingsWindow: BrowserWindow | null = null;

function isPositiveNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

export function openSettingsWindow(): void {
  if (settingsWindow) {
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 340,
    height: 280,
    resizable: false,
    title: 'Settings',
    webPreferences: {
      preload: path.join(__dirname, 'settingsPreload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });

  const devServerUrl = process.env.ELECTRON_RENDERER_URL;
  if (devServerUrl) {
    settingsWindow.loadURL(`${devServerUrl}/settings.html`);
  } else {
    settingsWindow.loadFile(path.join(__dirname, '../renderer/settings.html'));
  }
}

export function initSettings(): void {
  ipcMain.handle('settings:get', (): EditableSettings => {
    return {
      reminderIntervalMinutes: settingsStore.get('reminderIntervalMinutes'),
      dailyGoalMl: settingsStore.get('dailyGoalMl'),
      launchAtLogin: settingsStore.get('launchAtLogin'),
    };
  });

  ipcMain.handle('settings:get-progress', (): TodaysProgress => getTodaysProgress());

  ipcMain.on('settings:set-reminder-interval', (_event, minutes: number) => {
    if (!isPositiveNumber(minutes)) {
      console.log(`[settings] Ignoring invalid reminder interval: ${minutes}`);
      return;
    }
    settingsStore.set('reminderIntervalMinutes', minutes);
  });

  ipcMain.on('settings:set-daily-goal', (_event, ml: number) => {
    if (!isPositiveNumber(ml)) {
      console.log(`[settings] Ignoring invalid daily goal: ${ml}`);
      return;
    }
    settingsStore.set('dailyGoalMl', ml);
  });

  ipcMain.on('settings:set-launch-at-login', (_event, enabled: boolean) => {
    settingsStore.set('launchAtLogin', enabled);
    applyLaunchAtLogin(enabled);
  });
}
