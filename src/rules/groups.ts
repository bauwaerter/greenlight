import type { EvalContext } from '../context.js';

/**
 * SPEC.md rule 5, and OBSERVATIONS.md §1.2.
 *
 * This is a visibility gate, not a rule. It returns a boolean rather than a reason
 * code because rule 5 requires BLOCKED with an EMPTY reasons list — group membership
 * is confidential and must not be disclosed. GROUP_RESTRICTED therefore appears in
 * the SPEC.md reason table but is never emitted.
 *
 * It must short-circuit the whole evaluation. If it did not, a restricted volunteer
 * would see the other reasons, fix them, and still be blocked with no explanation —
 * exactly the outcome SPEC.md calls "the worst possible outcome for us".
 *
 * The real fix is upstream: these openings should be filtered out of browse entirely
 * so the question is never asked. See OBSERVATIONS.md §1.2.
 */
export function isGroupRestricted(ctx: EvalContext): boolean {
  const restrictedTo = ctx.target.opportunity.restrictedToGroupIds;
  if (restrictedTo.length === 0) return false;
  return !restrictedTo.some((groupId) => ctx.volunteer.groups.has(groupId));
}
