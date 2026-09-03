import type { EvalContext } from '../context.js';
import { overlaps, toInterval } from '../intervals.js';
import type { ReasonCode } from '../types.js';

/**
 * SPEC.md rule 6. Only confirmed signups block, which the context already enforces.
 *
 * A shift never conflicts with itself (OBSERVATIONS.md §2.2). Without this guard, a
 * volunteer already confirmed on this opening would get a spurious SCHEDULE_CONFLICT
 * alongside ALREADY_SIGNED_UP, because they are confirmed on a shift that overlaps
 * the one being checked — namely this one.
 */
export function scheduleRule(ctx: EvalContext): ReasonCode[] {
  const target = toInterval(ctx.target.shift);

  for (const committed of ctx.volunteer.confirmedShifts) {
    if (committed.shift.id === ctx.target.shift.id) continue;
    if (overlaps(target, toInterval(committed.shift))) return ['SCHEDULE_CONFLICT'];
  }

  return [];
}
