export const TIME_PRESETS = [
  { key: '1m', label: '1分钟' },
  { key: '5m', label: '5分钟' },
  { key: '15m', label: '15分钟' },
  { key: '30m', label: '30分钟' },
  { key: '1h', label: '1小时' },
  { key: '4h', label: '4小时' },
  { key: '1d', label: '1天' },
  { key: 'today', label: '今天' },
  { key: 'yesterday', label: '昨天' },
  { key: 'dayBeforeYesterday', label: '前天' },
  { key: '7d', label: '1周' },
  { key: 'thisWeek', label: '本周' },
  { key: 'lastWeek', label: '上周' },
  { key: '30d', label: '30天' },
  { key: 'thisMonth', label: '本月' },
  { key: 'lastMonth', label: '上月' },
  { key: 'thisQuarter', label: '本季度' },
  { key: 'custom', label: '自定义' },
] as const;

export type TimePresetKey = (typeof TIME_PRESETS)[number]['key'];
export type TimeRange = { start: Date; end: Date };

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const addDays = (date: Date, days: number) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
const startOfWeek = (date: Date) => {
  const day = (date.getDay() + 6) % 7;
  return addDays(startOfDay(date), -day);
};

export function getTimeRange(key: TimePresetKey, now: Date, customRange?: TimeRange | null): TimeRange {
  const end = new Date(now);
  const duration = (milliseconds: number): TimeRange => ({ start: new Date(end.getTime() - milliseconds), end });
  const today = startOfDay(end);
  const yesterday = addDays(today, -1);
  const dayBeforeYesterday = addDays(today, -2);
  const thisWeek = startOfWeek(end);
  const lastWeek = addDays(thisWeek, -7);
  const thisMonth = new Date(end.getFullYear(), end.getMonth(), 1);
  const lastMonth = new Date(end.getFullYear(), end.getMonth() - 1, 1);
  const quarterStartMonth = Math.floor(end.getMonth() / 3) * 3;

  switch (key) {
    case '1m': return duration(60_000);
    case '5m': return duration(5 * 60_000);
    case '15m': return duration(15 * 60_000);
    case '30m': return duration(30 * 60_000);
    case '1h': return duration(60 * 60_000);
    case '4h': return duration(4 * 60 * 60_000);
    case '1d': return duration(24 * 60 * 60_000);
    case 'today': return { start: today, end };
    case 'yesterday': return { start: yesterday, end: new Date(today.getTime() - 1) };
    case 'dayBeforeYesterday': return { start: dayBeforeYesterday, end: new Date(yesterday.getTime() - 1) };
    case '7d': return duration(7 * 24 * 60 * 60_000);
    case 'thisWeek': return { start: thisWeek, end };
    case 'lastWeek': return { start: lastWeek, end: new Date(thisWeek.getTime() - 1) };
    case '30d': return duration(30 * 24 * 60 * 60_000);
    case 'thisMonth': return { start: thisMonth, end };
    case 'lastMonth': return { start: lastMonth, end: new Date(thisMonth.getTime() - 1) };
    case 'thisQuarter': return { start: new Date(end.getFullYear(), quarterStartMonth, 1), end };
    case 'custom':
      return customRange
        ? { start: new Date(customRange.start), end: new Date(customRange.end) }
        : duration(24 * 60 * 60_000);
  }
}

const pad = (value: number) => String(value).padStart(2, '0');

export function formatDateTime(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function formatDateTimeInput(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}
