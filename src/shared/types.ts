export interface AppSettings {
  reminderIntervalMinutes: number;
  snoozeMinutes: number;
  dailyGoalMl: number;
  launchAtLogin: boolean;
  remindersEnabled: boolean;
  /** Raw count of Drink Water actions taken today (local time). No per-drink timestamps. */
  drinksToday: number;
  /** Local YYYY-MM-DD date drinksToday last applied to — compared on each read/write to detect
   *  a day rollover. Not a scheduled job; see progress.ts's ensureCurrentDay(). */
  lastDrinkDate: string;
}

/** Today's drink count plus the (derived, not stored) goal expressed in drinks. */
export interface TodaysProgress {
  drinksToday: number;
  goalDrinks: number;
}

/** The subset of AppSettings the Settings window reads and edits. */
export type EditableSettings = Pick<
  AppSettings,
  'reminderIntervalMinutes' | 'dailyGoalMl' | 'launchAtLogin'
>;
