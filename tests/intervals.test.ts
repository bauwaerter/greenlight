import { describe, expect, it } from 'vitest';
import { overlaps, toInterval } from '../src/intervals.js';
import type { Shift } from '../src/types.js';

function shift(startsAt: string, endsAt: string): Shift {
  return {
    id: 's',
    opportunityId: 'o',
    title: 't',
    startsAt,
    endsAt,
    isPublished: true,
    isActive: true,
  };
}

describe('overlaps', () => {
  it('is true for shifts that genuinely overlap', () => {
    const a = toInterval(shift('2026-09-14T11:00:00', '2026-09-14T15:00:00'));
    const b = toInterval(shift('2026-09-14T14:00:00', '2026-09-14T18:00:00'));
    expect(overlaps(a, b)).toBe(true);
    expect(overlaps(b, a)).toBe(true);
  });

  it('is false for shifts that merely touch', () => {
    // OBSERVATIONS.md §2.3. The fixtures contain this pair deliberately:
    // Monday Lunch Prep ends 12:00 and Monday Lunch Service starts 12:00.
    const a = toInterval(shift('2026-09-14T09:00:00', '2026-09-14T12:00:00'));
    const b = toInterval(shift('2026-09-14T12:00:00', '2026-09-14T15:00:00'));
    expect(overlaps(a, b)).toBe(false);
    expect(overlaps(b, a)).toBe(false);
  });

  it('is false for shifts on different days', () => {
    const a = toInterval(shift('2026-09-14T11:00:00', '2026-09-14T15:00:00'));
    const b = toInterval(shift('2026-09-15T11:00:00', '2026-09-15T14:00:00'));
    expect(overlaps(a, b)).toBe(false);
  });

  it('is true when one shift wholly contains another', () => {
    const a = toInterval(shift('2026-09-14T09:00:00', '2026-09-14T18:00:00'));
    const b = toInterval(shift('2026-09-14T11:00:00', '2026-09-14T12:00:00'));
    expect(overlaps(a, b)).toBe(true);
    expect(overlaps(b, a)).toBe(true);
  });

  it('is true for an identical pair', () => {
    const a = toInterval(shift('2026-09-14T09:00:00', '2026-09-14T12:00:00'));
    expect(overlaps(a, a)).toBe(true);
  });

  it('throws on an unparseable timestamp', () => {
    expect(() => toInterval(shift('not-a-date', '2026-09-14T12:00:00'))).toThrow(/not-a-date/);
  });
});
