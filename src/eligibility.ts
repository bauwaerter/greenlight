import { buildVolunteerContext, resolveTarget } from './context.js';
import type { EvalContext, VolunteerContext } from './context.js';
import type { Dataset } from './dataset.js';
import { DEFAULT_POLICY } from './policy.js';
import type { PolicyConfig } from './policy.js';
import { assessCapacity, isGroupRestricted, RULES } from './rules/index.js';
import type { EligibilityResult, ReasonCode } from './types.js';

export function evaluate(ctx: EvalContext): EligibilityResult {
  // SPEC.md rule 5 / OBSERVATIONS.md §1.2: this must short-circuit. Returning the
  // other reasons alongside an unexplained block would let a volunteer fix everything
  // they were told about and still be refused.
  if (isGroupRestricted(ctx)) return { status: 'BLOCKED', reasons: [] };

  const reasons = new Set<ReasonCode>();
  for (const rule of RULES) {
    for (const reason of rule(ctx)) reasons.add(reason);
  }

  // OBSERVATIONS.md §2.1: blocking reasons beat capacity. Offering a waitlist place
  // to someone who is not qualified to take it would be a false promise.
  if (reasons.size > 0) {
    return { status: 'BLOCKED', reasons: [...reasons].sort() };
  }

  const status = assessCapacity(ctx).outcome === 'WAITLIST' ? 'WAITLIST' : 'ELIGIBLE';
  return { status, reasons: [] };
}

export interface EligibilityChecker {
  /** The signature SPEC.md names. Dataset and policy are bound by createChecker. */
  checkEligibility(volunteerId: string, openingId: string): EligibilityResult;
  /** SPEC.md "Nice to have" — keyed by openingId. */
  checkOpportunity(volunteerId: string, opportunityId: string): Record<string, EligibilityResult>;
}

export function createChecker(
  dataset: Dataset,
  policy: PolicyConfig = DEFAULT_POLICY,
): EligibilityChecker {
  function contextFor(volunteer: VolunteerContext, openingId: string): EvalContext {
    return { dataset, policy, volunteer, target: resolveTarget(dataset, openingId) };
  }

  return {
    checkEligibility(volunteerId, openingId) {
      return evaluate(contextFor(buildVolunteerContext(dataset, volunteerId, policy), openingId));
    },
    checkOpportunity(volunteerId, opportunityId) {
      // The volunteer's qualifications, groups, waivers and committed shifts do not
      // change from one opening to the next, so they are resolved exactly once.
      // SPEC.md "Nice to have": the browse page renders a whole opportunity at a time.
      const volunteer = buildVolunteerContext(dataset, volunteerId, policy);
      const results: Record<string, EligibilityResult> = {};

      for (const opening of dataset.openingsForOpportunity(opportunityId)) {
        results[opening.id] = evaluate(contextFor(volunteer, opening.id));
      }

      return results;
    },
  };
}
