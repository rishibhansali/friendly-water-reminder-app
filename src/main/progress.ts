import { settingsStore } from './store';
import { DEFAULT_SERVING_SIZE_ML } from '../shared/constants';
import type { TodaysProgress } from '../shared/types';

function todayLocalDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Resets drinksToday if the stored lastDrinkDate isn't today (local time).
// Called at the top of every read/write in this module instead of a
// scheduled midnight job — correct even if the app wasn't running at
// midnight, since the check happens whenever next accessed.
function ensureCurrentDay(): void {
  const today = todayLocalDate();
  if (settingsStore.get('lastDrinkDate') !== today) {
    console.log(`[progress] Day rolled over — resetting drinksToday (was for a different date).`);
    settingsStore.set({ drinksToday: 0, lastDrinkDate: today });
  }
}

export function recordDrink(): void {
  ensureCurrentDay();
  const drinksToday = settingsStore.get('drinksToday') + 1;
  settingsStore.set('drinksToday', drinksToday);
  console.log(`[progress] Recorded drink #${drinksToday} today.`);
}

export function getTodaysProgress(): TodaysProgress {
  ensureCurrentDay();
  const goalDrinks = Math.ceil(settingsStore.get('dailyGoalMl') / DEFAULT_SERVING_SIZE_ML);
  return {
    drinksToday: settingsStore.get('drinksToday'),
    goalDrinks,
  };
}
