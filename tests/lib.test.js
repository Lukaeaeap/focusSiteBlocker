const { normalizeHost, stableId, formatCompactDuration, timeToMinutes, getLocalDateKey, isScheduleActiveAt } = require('../src/lib');

describe('lib utilities', () => {
    test('normalizeHost works with urls and hosts', () => {
        expect(normalizeHost('https://WWW.Example.com/path')).toBe('example.com');
        expect(normalizeHost('example.com/path')).toBe('example.com');
    });

    test('stableId is deterministic and produces positive number', () => {
        const a = stableId('example.com');
        const b = stableId('example.com');
        const c = stableId('other.com');
        expect(typeof a).toBe('number');
        expect(a).toBeGreaterThan(0);
        expect(a).toBe(b);
        expect(a).not.toBe(c);
    });

    test('formatCompactDuration uses highest unit only', () => {
        expect(formatCompactDuration(19)).toBe('19s');
        expect(formatCompactDuration(301)).toBe('5m');
        expect(formatCompactDuration(5 * 3600 + 59)).toBe('5h');
        expect(formatCompactDuration(2 * 86400 + 3600)).toBe('2d');
    });

    test('timeToMinutes parses HH:MM', () => {
        expect(timeToMinutes('09:30')).toBe(570);
        expect(timeToMinutes('23:59')).toBe(1439);
        expect(timeToMinutes('25:10')).toBe(-1);
    });

    test('getLocalDateKey formats local date', () => {
        const k = getLocalDateKey(new Date(2026, 2, 18, 11, 20, 0, 0).getTime());
        expect(k).toBe('2026-03-18');
    });

    test('isScheduleActiveAt handles same-day windows', () => {
        const s = { enabled: true, days: [3], start: '09:00', end: '17:00' }; // Wednesday
        const inWindow = new Date(2026, 2, 18, 10, 0, 0, 0).getTime(); // Wed
        const outWindow = new Date(2026, 2, 18, 18, 0, 0, 0).getTime();
        expect(isScheduleActiveAt(s, inWindow)).toBe(true);
        expect(isScheduleActiveAt(s, outWindow)).toBe(false);
    });

    test('isScheduleActiveAt handles overnight windows', () => {
        const s = { enabled: true, days: [3], start: '22:00', end: '06:00' }; // starts Wed night
        const wed2330 = new Date(2026, 2, 18, 23, 30, 0, 0).getTime();
        const thu0300 = new Date(2026, 2, 19, 3, 0, 0, 0).getTime();
        expect(isScheduleActiveAt(s, wed2330)).toBe(true);
        expect(isScheduleActiveAt(s, thu0300)).toBe(true);
    });
});
