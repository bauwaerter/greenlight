import type { EvalContext } from '../context.js';
import type { ReasonCode } from '../types.js';

/**
 * SPEC.md rule 4. The signature must be against the waiver's current version — an
 * older one does not count because the text changed.
 */
export function waiverRule(ctx: EvalContext): ReasonCode[] {
  const requiredWaiverId = ctx.target.opportunity.requiredWaiverId;
  if (requiredWaiverId === null) return [];

  const waiver = ctx.dataset.waiver(requiredWaiverId);
  const signedVersion = ctx.volunteer.waiverVersions.get(requiredWaiverId);
  if (signedVersion === undefined) return ['WAIVER_REQUIRED'];

  // OBSERVATIONS.md §2.6: a signature recording a version newer than current happens
  // when a revision is rolled back. Blocking that volunteer would be self-inflicted.
  const acceptable = ctx.policy.acceptNewerWaiverVersions
    ? signedVersion >= waiver.currentVersion
    : signedVersion === waiver.currentVersion;

  return acceptable ? [] : ['WAIVER_REQUIRED'];
}
