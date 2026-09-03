import { buildVolunteerContext, resolveTarget } from './context.js';
import type { EvalContext, VolunteerContext } from './context.js';
import type { Dataset } from './dataset.js';
import { DEFAULT_POLICY } from './policy.js';
import type { PolicyConfig } from './policy.js';
import { assessCapacity, isGroupRestricted, RULES } from './rules/index.js';
import type { Audience, EligibilityResult, ReasonCode } from './types.js';

export function evaluate(ctx: EvalContext): EligibilityResult {
  const restricted = isGroupRestricted(ctx);

  // SPEC.md rule 5 / OBSERVATIONS.md §1.2: for a volunteer this must short-circuit.
  // Returning the other reasons alongside an unexplained block would let them fix
  // everything they were told about and still be refused.
  //
  // Returning *here*, before any rule runs, is what makes the guarantee structural
  // rather than a matter of remembering to redact: there is no populated reason set
  // in scope on this path for a future rule to leak through.
  if (restricted && ctx.audience === 'VOLUNTEER') return { status: 'BLOCKED', reasons: [] };

  const reasons = new Set<ReasonCode>();
  for (const rule of RULES) {
    for (const reason of rule(ctx)) reasons.add(reason);
  }

  // Only reachable for STAFF, by the return above. A coordinator has to be able to
  // explain a refusal the volunteer was deliberately not given.
  if (restricted) reasons.add('GROUP_RESTRICTED');

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
  audience: Audience = 'VOLUNTEER',
): EligibilityChecker {
  function contextFor(volunteer: VolunteerContext, openingId: string): EvalContext {
    return { dataset, policy, volunteer, audience, target: resolveTarget(dataset, openingId) };
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
