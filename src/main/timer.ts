import { settingsStore } from './store';
import { notify } from './notify';

let pendingFire: NodeJS.Timeout | null = null;
const fireHandlers: Array<() => void> = [];

/**
 * Lets other main-process modules (e.g. the overlay window) react to a fired
 * reminder without timer.ts importing them back — keeps this module's only
 * dependency as settingsStore/notify, never anything UI-related.
 */
export function registerFireHandler(handler: () => void): void {
  fireHandlers.push(handler);
}

function clearPending(): void {
  if (pendingFire) {
    clearTimeout(pendingFire);
    pendingFire = null;
  }
}

function scheduleFireInMinutes(delayMinutes: number): void {
  clearPending();
  if (!settingsStore.get('remindersEnabled')) {
    return;
  }
  pendingFire = setTimeout(fireReminder, delayMinutes * 60_000);
}

function fireReminder(): void {
  pendingFire = null;
  console.log('[timer] Reminder fired: time to drink water.');
  notify('Friendly Water Reminder', 'Time to drink water!');
  for (const handler of fireHandlers) {
    handler();
  }
}

export function drinkWater(): void {
  console.log('[timer] drinkWater() called — resetting to full interval.');
  scheduleFireInMinutes(settingsStore.get('reminderIntervalMinutes'));
}

export function snooze(): void {
  console.log('[timer] snooze() called — re-firing after a short delay.');
  scheduleFireInMinutes(settingsStore.get('snoozeMinutes'));
}

export function startScheduler(): void {
  scheduleFireInMinutes(settingsStore.get('reminderIntervalMinutes'));

  settingsStore.onDidChange('remindersEnabled', (enabled) => {
    if (enabled) {
      console.log('[timer] Reminders enabled — starting a fresh full interval.');
      scheduleFireInMinutes(settingsStore.get('reminderIntervalMinutes'));
    } else {
      console.log('[timer] Reminders disabled — clearing pending reminder.');
      clearPending();
    }
  });
}
