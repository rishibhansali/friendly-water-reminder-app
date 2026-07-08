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
    return (
      <div className="settings-root">
        <p className="loading">Loading…</p>
      </div>
    );
  }

  // Derived live from the goal field so editing it updates the ratio
  // immediately, rather than waiting on another round-trip to main.
  const goalDrinks = Math.ceil(settings.dailyGoalMl / DEFAULT_SERVING_SIZE_ML);

  return (
    <div className="settings-root">
      <h1 className="settings-title">Settings</h1>

      {drinksToday !== null && (
        <div className="progress-card">
          <span className="progress-value">
            {drinksToday} <span className="progress-of">/ {goalDrinks}</span>
          </span>
          <span className="progress-label">drinks today</span>
        </div>
      )}

      <div className="field-group">
        <label className="field">
          <span className="field-label">Reminder interval (minutes)</span>
          <input
            type="number"
            min="1"
            className="field-input"
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

        <label className="field">
          <span className="field-label">Daily water goal (ml)</span>
          <input
            type="number"
            min="1"
            className="field-input"
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

        <label className="field field-checkbox">
          <input
            type="checkbox"
            checked={settings.launchAtLogin}
            onChange={(e) => {
              const enabled = e.target.checked;
              setSettings({ ...settings, launchAtLogin: enabled });
              window.settingsBridge.setLaunchAtLogin(enabled);
            }}
          />
          <span className="field-label">Launch at Login</span>
        </label>
      </div>
    </div>
  );
}

export default Settings;
