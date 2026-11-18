import { inQuietHours, isValidClockTime, isValidTimeZone, localDayStart, localHour, quietHoursEnd } from '../src/utils/alertTime';

// Africa/Lagos is UTC+1 all year; Africa/Nairobi is UTC+3; Africa/Kinshasa is UTC+1.
const at = (iso: string) => new Date(iso);

describe('alertTime', () => {
  it('validates time zones and clock times', () => {
    expect(isValidTimeZone('Africa/Lagos')).toBe(true);
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
    expect(isValidTimeZone('')).toBe(false);
    expect(isValidClockTime('07:00')).toBe(true);
    expect(isValidClockTime('24:00')).toBe(false);
    expect(isValidClockTime('7:00')).toBe(false);
  });

  it('reads the local hour in the person\'s time zone', () => {
    expect(localHour(at('2026-11-16T07:30:00Z'), 'Africa/Lagos')).toBe(8);
    expect(localHour(at('2026-11-16T07:30:00Z'), 'Africa/Nairobi')).toBe(10);
    expect(localHour(at('2026-11-16T23:30:00Z'), 'Africa/Lagos')).toBe(0);
  });

  it('handles a quiet window that crosses midnight', () => {
    const tz = 'Africa/Lagos';
    expect(inQuietHours(at('2026-11-16T20:30:00Z'), tz, '21:00', '07:00')).toBe(true);   // 21:30 local
    expect(inQuietHours(at('2026-11-16T02:00:00Z'), tz, '21:00', '07:00')).toBe(true);   // 03:00 local
    expect(inQuietHours(at('2026-11-16T06:00:00Z'), tz, '21:00', '07:00')).toBe(false);  // 07:00 local
    expect(inQuietHours(at('2026-11-16T12:00:00Z'), tz, '21:00', '07:00')).toBe(false);  // 13:00 local
  });

  it('handles a same-day quiet window and an empty one', () => {
    const tz = 'Africa/Lagos';
    expect(inQuietHours(at('2026-11-16T12:30:00Z'), tz, '13:00', '15:00')).toBe(true);
    expect(inQuietHours(at('2026-11-16T15:00:00Z'), tz, '13:00', '15:00')).toBe(false);
    expect(inQuietHours(at('2026-11-16T12:30:00Z'), tz, '08:00', '08:00')).toBe(false);
  });

  it('finds when the quiet window ends', () => {
    // 22:15 local in Lagos -> ends 07:00 local next day = 06:00Z
    expect(quietHoursEnd(at('2026-11-16T21:15:30Z'), 'Africa/Lagos', '07:00').toISOString()).toBe('2026-11-17T06:00:00.000Z');
    // 03:00 local -> ends 07:00 the same morning
    expect(quietHoursEnd(at('2026-11-16T02:00:00Z'), 'Africa/Lagos', '07:00').toISOString()).toBe('2026-11-16T06:00:00.000Z');
  });

  it('finds the start of the local day', () => {
    expect(localDayStart(at('2026-11-16T12:34:56Z'), 'Africa/Lagos').toISOString()).toBe('2026-11-15T23:00:00.000Z');
    expect(localDayStart(at('2026-11-16T12:34:56Z'), 'Africa/Nairobi').toISOString()).toBe('2026-11-15T21:00:00.000Z');
  });
});
