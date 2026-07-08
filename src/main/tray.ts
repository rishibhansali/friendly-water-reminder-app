import { app, Menu, nativeImage, Notification, Tray } from 'electron';
import { settingsStore } from './store';

let tray: Tray | null = null;

function applyLoginItemSettings(launchAtLogin: boolean): void {
  app.setLoginItemSettings({ openAtLogin: launchAtLogin });
}

function notifyStub(title: string, body: string): void {
  console.log(`[tray] ${title}: ${body}`);
  if (Notification.isSupported()) {
    new Notification({ title, body }).show();
  }
}

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
        applyLoginItemSettings(menuItem.checked);
      },
    },
    { type: 'separator' },
    {
      label: 'Set Goal…',
      click: () => {
        notifyStub('Set Goal', 'Goal settings are coming soon.');
      },
    },
    {
      label: 'Remind me in 10 min',
      click: () => {
        notifyStub('Snooze', 'Reminder snoozed for 10 minutes (stub — no timer yet).');
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
  tray.setContextMenu(buildMenu());

  // Ensure the OS-level login item setting matches whatever was last persisted,
  // since setLoginItemSettings isn't itself durable across store resets/reinstalls.
  applyLoginItemSettings(settingsStore.get('launchAtLogin'));

  return tray;
}
