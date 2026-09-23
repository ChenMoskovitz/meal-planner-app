import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// The helpers read local calendar fields, so their output depends on the
// machine's timezone. CI runs in UTC, where the toISOString() bug these guard
// against never shows up. Pin the zone the app is actually used in so the
// tests mean the same thing everywhere. Node re-reads TZ on assignment.
process.env.TZ = 'Asia/Jerusalem';

import { getSundayOfCurrentWeek, toLocalDateString, getWeekDaysFromSunday } from './weekDates.js';

// Month is 0-based in the Date constructor, which is easy to misread in a
// table of dates. Take the calendar month instead.
const local = (year, month, day, hour = 12) => new Date(year, month - 1, day, hour);

describe('getSundayOfCurrentWeek', () => {
    it('goes back to the Sunday that starts the week', () => {
        // Wed 16 Sep 2026 -> Sun 13 Sep 2026
        expect(toLocalDateString(getSundayOfCurrentWeek(local(2026, 9, 16)))).toBe('2026-09-13');
    });

    it('returns the same day when given a Sunday', () => {
        expect(toLocalDateString(getSundayOfCurrentWeek(local(2026, 9, 13)))).toBe('2026-09-13');
    });

    it('crosses back into the previous month', () => {
        // Thu 1 Oct 2026 -> Sun 27 Sep 2026. setDate() with a day below 1
        // rolls the month, which is what makes this work.
        expect(toLocalDateString(getSundayOfCurrentWeek(local(2026, 10, 1)))).toBe('2026-09-27');
    });

    it('crosses back into the previous year', () => {
        // Thu 1 Jan 2026 -> Sun 28 Dec 2025
        expect(toLocalDateString(getSundayOfCurrentWeek(local(2026, 1, 1)))).toBe('2025-12-28');
    });

    it('leaves the date it was given untouched', () => {
        // setDate() mutates, so the helper has to copy first. The component
        // passes `new Date()` today, but a shared state value would be corrupted.
        const wednesday = local(2026, 9, 16);
        getSundayOfCurrentWeek(wednesday);

        expect(toLocalDateString(wednesday)).toBe('2026-09-16');
    });

    describe('with today as the input', () => {
        // The component calls getSundayOfCurrentWeek(new Date()) on mount. Fake
        // timers make "today" a fixed date so the test does not drift.
        beforeEach(() => {
            vi.useFakeTimers();
            vi.setSystemTime(local(2026, 9, 16));
        });

        afterEach(() => {
            vi.useRealTimers();
        });

        it('finds the Sunday of the current week', () => {
            expect(toLocalDateString(getSundayOfCurrentWeek(new Date()))).toBe('2026-09-13');
        });
    });
});

describe('toLocalDateString', () => {
    it('formats as YYYY-MM-DD with zero-padded month and day', () => {
        expect(toLocalDateString(local(2026, 3, 5))).toBe('2026-03-05');
    });

    it('keeps the local calendar day just after midnight east of Greenwich', () => {
        // 01:00 on 17 Sep in Jerusalem (UTC+3) is still 16 Sep in UTC, so
        // toISOString() reports the wrong day. This is the bug the helper
        // exists to avoid, so the test states both sides of it.
        const earlyMorning = local(2026, 9, 17, 1);

        expect(earlyMorning.toISOString().slice(0, 10)).toBe('2026-09-16');
        expect(toLocalDateString(earlyMorning)).toBe('2026-09-17');
    });
});

describe('getWeekDaysFromSunday', () => {
    it('lists the seven days starting from the given Sunday', () => {
        expect(getWeekDaysFromSunday(local(2026, 9, 13))).toEqual([
            '2026-09-13',
            '2026-09-14',
            '2026-09-15',
            '2026-09-16',
            '2026-09-17',
            '2026-09-18',
            '2026-09-19'
        ]);
    });

    it('carries over into the next month', () => {
        const week = getWeekDaysFromSunday(local(2026, 9, 27));

        expect(week[0]).toBe('2026-09-27');
        expect(week[3]).toBe('2026-09-30');
        expect(week[4]).toBe('2026-10-01');
        expect(week[6]).toBe('2026-10-03');
    });

    // Israel switches to summer time on Fri 27 Mar 2026 and back on Sun 25 Oct
    // 2026. A day is 23 or 25 hours across the change, so adding 24 hours would
    // skip or repeat a date. setDate() works on the calendar and is immune.
    it.each([
        ['starts', local(2026, 3, 22), ['2026-03-22', '2026-03-23', '2026-03-24', '2026-03-25', '2026-03-26', '2026-03-27', '2026-03-28']],
        ['ends', local(2026, 10, 25), ['2026-10-25', '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31']]
    ])('keeps one entry per day in the week daylight saving %s', (_, sunday, expected) => {
        expect(getWeekDaysFromSunday(sunday)).toEqual(expected);
    });

    it('does not mutate the Sunday it was given', () => {
        const sunday = local(2026, 9, 13);
        getWeekDaysFromSunday(sunday);

        expect(toLocalDateString(sunday)).toBe('2026-09-13');
    });
});
