import Store from 'electron-store';
import type { AppSettings } from '../shared/types';
import {
  DEFAULT_REMINDER_INTERVAL_MINUTES,
  DEFAULT_SNOOZE_MINUTES,
  DEFAULT_DAILY_GOAL_ML,
  DEFAULT_LAUNCH_AT_LOGIN,
  DEFAULT_REMINDERS_ENABLED,
  DEFAULT_DRINKS_TODAY,
} from '../shared/constants';

const defaults: AppSettings = {
  reminderIntervalMinutes: DEFAULT_REMINDER_INTERVAL_MINUTES,
  snoozeMinutes: DEFAULT_SNOOZE_MINUTES,
  dailyGoalMl: DEFAULT_DAILY_GOAL_ML,
  launchAtLogin: DEFAULT_LAUNCH_AT_LOGIN,
  remindersEnabled: DEFAULT_REMINDERS_ENABLED,
  drinksToday: DEFAULT_DRINKS_TODAY,
  // Deliberately not a real date — anything other than today's actual
  // YYYY-MM-DD triggers progress.ts's rollover reset on first access.
  lastDrinkDate: '',
};

export const settingsStore = new Store<AppSettings>({ defaults });
