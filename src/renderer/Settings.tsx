import { useEffect, useState } from 'react';
import type { EditableSettings } from '../shared/types';
import { DEFAULT_SERVING_SIZE_ML } from '../shared/constants';
import './settings.css';

declare global {
  interface Window {
    settingsBridge: {
      getSettings: () => Promise<EditableSettings>;
      getProgress: () => Promise<{ drinksToday: number; goalDrinks: number }>;
      setReminderInterval: (minutes: number) => void;
      setDailyGoal: (ml: number) => void;
      setLaunchAtLogin: (enabled: boolean) => void;
    };
  }
}

function Settings() {
  const [settings, setSettings] = useState<EditableSettings | null>(null);
  const [drinksToday, setDrinksToday] = useState<number | null>(null);

  useEffect(() => {
    window.settingsBridge.getSettings().then(setSettings);
    window.settingsBridge.getProgress().then((progress) => setDrinksToday(progress.drinksToday));
  }, []);

  if (!settings) {
    return <div className="settings-root">Loading…</div>;
  }

  // Derived live from the goal field so editing it updates the ratio
  // immediately, rather than waiting on another round-trip to main.
  const goalDrinks = Math.ceil(settings.dailyGoalMl / DEFAULT_SERVING_SIZE_ML);

  return (
    <div className="settings-root">
      {drinksToday !== null && (
        <p className="progress-line">
          Today: {drinksToday} / {goalDrinks}
        </p>
      )}

      <label>
        Reminder interval (minutes)
        <input
          type="number"
          min="1"
          value={settings.reminderIntervalMinutes}
          onChange={(e) => {
            const minutes = e.target.valueAsNumber;
            setSettings({ ...settings, reminderIntervalMinutes: minutes });
            if (Number.isFinite(minutes) && minutes > 0) {
              window.settingsBridge.setReminderInterval(minutes);
            }
          }}
        />
      </label>

      <label>
        Daily water goal (ml)
        <input
          type="number"
          min="1"
          value={settings.dailyGoalMl}
          onChange={(e) => {
            const ml = e.target.valueAsNumber;
            setSettings({ ...settings, dailyGoalMl: ml });
            if (Number.isFinite(ml) && ml > 0) {
              window.settingsBridge.setDailyGoal(ml);
            }
          }}
        />
      </label>

      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={settings.launchAtLogin}
          onChange={(e) => {
            const enabled = e.target.checked;
            setSettings({ ...settings, launchAtLogin: enabled });
            window.settingsBridge.setLaunchAtLogin(enabled);
          }}
        />
        Launch at Login
      </label>
    </div>
  );
}

export default Settings;
