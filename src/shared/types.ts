export interface AppSettings {
  reminderIntervalMinutes: number;
  snoozeMinutes: number;
  dailyGoalMl: number;
  launchAtLogin: boolean;
  remindersEnabled: boolean;
}

/** The subset of AppSettings the Settings window reads and edits. */
export type EditableSettings = Pick<
  AppSettings,
  'reminderIntervalMinutes' | 'dailyGoalMl' | 'launchAtLogin'
>;
