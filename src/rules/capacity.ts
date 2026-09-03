import type { EvalContext } from '../context.js';
import type { ReasonCode } from '../types.js';

export type CapacityOutcome = 'OPEN' | 'WAITLIST' | 'FULL';

export interface CapacityAssessment {
  outcome: CapacityOutcome;
  confirmed: number;
  waitlisted: number;
}

/**
 * SPEC.md rule 2. Separated from capacityRule because the WAITLIST *status* needs
 * this answer even when the rule itself reports no blocking reason.
 */
export function assessCapacity(ctx: EvalContext): CapacityAssessment {
  const { maxVolunteers, waitlistMax } = ctx.target.opening;
  const signups = ctx.dataset.signupsForOpening(ctx.target.opening.id);

  let confirmed = 0;
  let waitlisted = 0;
  for (const signup of signups) {
    if (signup.state === 'CONFIRMED') confirmed += 1;
    else waitlisted += 1;
  }

  if (confirmed < maxVolunteers) return { outcome: 'OPEN', confirmed, waitlisted };
  if (waitlisted < waitlistMax) return { outcome: 'WAITLIST', confirmed, waitlisted };
  return { outcome: 'FULL', confirmed, waitlisted };
}

export function capacityRule(ctx: EvalContext): ReasonCode[] {
  const existing = ctx.volunteer.signupsByOpening.get(ctx.target.opening.id);
  if (existing !== undefined) {
    // OBSERVATIONS.md §2.4: whether a waitlist place counts is a policy decision.
    if (existing === 'CONFIRMED' || ctx.policy.waitlistedCountsAsSignedUp) {
      return ['ALREADY_SIGNED_UP'];
    }
  }

  if (assessCapacity(ctx).outcome !== 'FULL') return [];

  // SPEC.md distinguishes "no waitlist offered" from "waitlist exists but is full".
  return ctx.target.opening.waitlistMax === 0 ? ['AT_CAPACITY'] : ['WAITLIST_FULL'];
}
