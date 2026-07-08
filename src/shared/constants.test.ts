import { describe, expect, it } from 'vitest';
import { DEFAULT_REMINDER_INTERVAL_MINUTES, DEFAULT_SNOOZE_MINUTES } from './constants';

describe('shared constants', () => {
  it('defaults the reminder interval to 60 minutes', () => {
    expect(DEFAULT_REMINDER_INTERVAL_MINUTES).toBe(60);
  });

  it('defaults the snooze duration to less than the reminder interval', () => {
    expect(DEFAULT_SNOOZE_MINUTES).toBeLessThan(DEFAULT_REMINDER_INTERVAL_MINUTES);
  });
});
