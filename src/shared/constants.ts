export const DEFAULT_REMINDER_INTERVAL_MINUTES = 60;
export const DEFAULT_SNOOZE_MINUTES = 10;
export const DEFAULT_DAILY_GOAL_ML = 2000;
export const DEFAULT_LAUNCH_AT_LOGIN = false;
export const DEFAULT_REMINDERS_ENABLED = true;
export const DEFAULT_DRINKS_TODAY = 0;

/**
 * Assumed volume of one "Drink Water" action, used only to derive a
 * drinks-based goal (dailyGoalMl / this) for display — never stored, and
 * dailyGoalMl itself stays the source of truth in ml.
 */
export const DEFAULT_SERVING_SIZE_ML = 250;
