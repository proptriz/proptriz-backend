// src/utils/alertTime.ts
// Time-zone helpers for alert routing (quiet hours, digest hour, daily cap).
// Uses the built-in Intl time-zone data, so there is no date library to ship.

export const DEFAULT_TIMEZONE = 'Africa/Lagos';
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isValidTimeZone(timeZone: unknown): timeZone is string {
  if (typeof timeZone !== 'string' || !timeZone || timeZone.length > 64) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

export function isValidClockTime(value: unknown): value is string {
  return typeof value === 'string' && TIME_RE.test(value);
}

function toMinutes(clock: string): number {
  const [h, m] = clock.split(':').map(Number);
  return h * 60 + m;
}

/** Hour and minute of `date` as a clock on the wall in `timeZone`. */
export function localClock(date: Date, timeZone: string): { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: isValidTimeZone(timeZone) ? timeZone : DEFAULT_TIMEZONE,
    hourCycle: 'h23',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { hour: get('hour'), minute: get('minute') };
}

export function localHour(date: Date, timeZone: string): number {
  return localClock(date, timeZone).hour;
}

/** Start of the current local day in `timeZone`, as an absolute time. */
export function localDayStart(date: Date, timeZone: string): Date {
  const { hour, minute } = localClock(date, timeZone);
  const msIntoMinute = date.getTime() % 60_000;
  return new Date(date.getTime() - (hour * 60 + minute) * 60_000 - msIntoMinute);
}

/** True when `date` falls inside the quiet window (which may cross midnight). */
export function inQuietHours(date: Date, timeZone: string, start: string, end: string): boolean {
  const startMin = toMinutes(start);
  const endMin = toMinutes(end);
  if (startMin === endMin) return false;

  const { hour, minute } = localClock(date, timeZone);
  const now = hour * 60 + minute;
  return startMin < endMin ? now >= startMin && now < endMin : now >= startMin || now < endMin;
}

/** The next moment the quiet window ends. Only meaningful while inside it. */
export function quietHoursEnd(date: Date, timeZone: string, end: string): Date {
  const { hour, minute } = localClock(date, timeZone);
  const now = hour * 60 + minute;
  const minutesLeft = (toMinutes(end) - now + 1440) % 1440 || 1440;
  const startOfMinute = date.getTime() - (date.getTime() % 60_000);
  return new Date(startOfMinute + minutesLeft * 60_000);
}
