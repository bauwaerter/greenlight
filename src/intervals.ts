import type { Shift } from './types.js';

export interface Interval {
  start: number;
  end: number;
}

/**
 * Shift timestamps carry no offset (OBSERVATIONS.md §3.1). Date.parse reads them as
 * local time, which is consistent across every shift, so comparisons between them are
 * sound *as long as every shift is in one timezone*. The fixtures span Indianapolis
 * and Denver, so they are not. This is a known and documented limitation: fixing it
 * needs a timezone on the organization or offsets in the data, not a change here.
 */
export function toInterval(shift: Shift): Interval {
  const start = Date.parse(shift.startsAt);
  const end = Date.parse(shift.endsAt);
  if (Number.isNaN(start)) throw new Error(`Unparseable startsAt on ${shift.id}: ${shift.startsAt}`);
  if (Number.isNaN(end)) throw new Error(`Unparseable endsAt on ${shift.id}: ${shift.endsAt}`);
  return { start, end };
}

/**
 * Half-open intervals: shifts that merely touch do not overlap. Working a morning
 * block that ends at 12:00 and an afternoon block that starts at 12:00 is the most
 * common real pattern in the data, and treating it as a conflict would be wrong.
 */
export function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end;
}
