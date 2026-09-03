import type { EvalContext } from '../context.js';
import type { ReasonCode } from '../types.js';

/**
 * SPEC.md rule 1. All three conditions are reported independently — a shift can be
 * both unpublished and cancelled, and the volunteer is told about both.
 */
export function statusRule(ctx: EvalContext): ReasonCode[] {
  const reasons: ReasonCode[] = [];
  const { shift, opening } = ctx.target;

  if (!shift.isPublished) reasons.push('SHIFT_NOT_PUBLISHED');
  if (!shift.isActive) reasons.push('SHIFT_INACTIVE');
  if (!opening.isActive) reasons.push('OPENING_INACTIVE');

  return reasons;
}
