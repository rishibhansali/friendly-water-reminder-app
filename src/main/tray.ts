import { app, Menu, nativeImage, Tray } from 'electron';
import { settingsStore } from './store';
import { notify } from './notify';
import { applyLaunchAtLogin } from './launch-at-login';
import { openSettingsWindow } from './settings';

let tray: Tray | null = null;

function buildMenu(): Menu {
  return Menu.buildFromTemplate([
    {
      label: 'Reminders On',
      type: 'checkbox',
      checked: settingsStore.get('remindersEnabled'),
      click: (menuItem) => {
        settingsStore.set('remindersEnabled', menuItem.checked);
      },
    },
    {
      label: 'Launch at Login',
      type: 'checkbox',
      checked: settingsStore.get('launchAtLogin'),
      click: (menuItem) => {
        settingsStore.set('launchAtLogin', menuItem.checked);
        applyLaunchAtLogin(menuItem.checked);
      },
    },
    { type: 'separator' },
    {
      label: 'Settings…',
      click: () => {
        openSettingsWindow();
      },
    },
    {
      label: 'Remind me in 10 min',
      click: () => {
        notify('Snooze', 'Reminder snoozed for 10 minutes (stub — no timer yet).');
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.quit();
      },
    },
  ]);
}

export function createTray(): Tray {
  tray = new Tray(nativeImage.createEmpty());
  tray.setTitle('💧');
  tray.setToolTip('Friendly Water Reminder');

  // Rebuild the menu fresh on every click rather than setContextMenu() once —
  // checkbox items snapshot their `checked` state at build time, so a menu
  // built once at startup would go stale the moment settings change from
  // anywhere else (e.g. the Settings window).
  tray.on('click', () => {
    tray?.popUpContextMenu(buildMenu());
  });
  tray.on('right-click', () => {
    tray?.popUpContextMenu(buildMenu());
  });

  // Ensure the OS-level login item setting matches whatever was last persisted,
  // since setLoginItemSettings isn't itself durable across store resets/reinstalls.
  applyLaunchAtLogin(settingsStore.get('launchAtLogin'));

  return tray;
}
