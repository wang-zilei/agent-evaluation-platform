import { describe, expect, it } from 'vitest';
import { formatDateTime, getTimeRange } from './overview-time';

const now = new Date(2026, 9, 21, 15, 30, 45);

describe('overview time ranges', () => {
  it('calculates rolling ranges from the current time', () => {
    const range = getTimeRange('1d', now);
    expect(range.end.getTime()).toBe(now.getTime());
    expect(range.end.getTime() - range.start.getTime()).toBe(24 * 60 * 60_000);
  });

  it('uses calendar boundaries for yesterday and last week', () => {
    const yesterday = getTimeRange('yesterday', now);
    expect(yesterday.start).toEqual(new Date(2026, 9, 20));
    expect(formatDateTime(yesterday.end)).toBe('2026-10-20 23:59:59');

    const lastWeek = getTimeRange('lastWeek', now);
    expect(lastWeek.start).toEqual(new Date(2026, 9, 12));
    expect(formatDateTime(lastWeek.end)).toBe('2026-10-18 23:59:59');
  });

  it('uses the current and previous month boundaries', () => {
    expect(getTimeRange('thisMonth', now).start).toEqual(new Date(2026, 9, 1));
    const lastMonth = getTimeRange('lastMonth', now);
    expect(lastMonth.start).toEqual(new Date(2026, 8, 1));
    expect(formatDateTime(lastMonth.end)).toBe('2026-09-30 23:59:59');
  });

  it('uses quarter boundaries and preserves an applied custom range', () => {
    expect(getTimeRange('thisQuarter', now).start).toEqual(new Date(2026, 9, 1));
    const custom = { start: new Date(2026, 9, 3, 8), end: new Date(2026, 9, 4, 18) };
    expect(getTimeRange('custom', now, custom)).toEqual(custom);
  });
});
