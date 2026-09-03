import type { EvalContext } from '../context.js';
import type { QualificationRule, ReasonCode } from '../types.js';
import type { PolicyConfig } from '../policy.js';

/**
 * True when the volunteer FAILS the rule.
 *
 * An empty qualificationIds list never fails. OBSERVATIONS.md §3.3: an empty list is
 * far more likely to be a half-configured rule than an intent to block every
 * volunteer, and blocking everyone is the more damaging way to be wrong.
 */
function fails(rule: QualificationRule, held: Set<string>, policy: PolicyConfig): boolean {
  const ids = rule.qualificationIds;
  if (ids.length === 0) return false;

  switch (rule.type) {
    case 'HAS_ANY':
      return !ids.some((id) => held.has(id));
    case 'HAS_ALL':
      return !ids.every((id) => held.has(id));
    case 'DOES_NOT_HAVE_ALL':
      // OBSERVATIONS.md §1.1 — SPEC.md's rule table and its worked example disagree.
      // 'ANY' reads the rule as an exclusion list, matching the Fern example.
      // 'ALL' reads it literally, matching the table.
      return policy.disallowedQualificationSemantics === 'ANY'
        ? ids.some((id) => held.has(id))
        : ids.every((id) => held.has(id));
  }
}

/**
 * SPEC.md rule 3. Active rules combine with AND — the volunteer must pass all of them.
 * Codes are collected into a Set so several failing rules of the same kind produce one
 * reason, not a repeated one (OBSERVATIONS.md §2.8).
 */
export function qualificationRule(ctx: EvalContext): ReasonCode[] {
  const reasons = new Set<ReasonCode>();
  const held = ctx.volunteer.qualifications;

  for (const rule of ctx.target.opportunity.qualificationRules) {
    if (!rule.isActive) continue;
    if (!fails(rule, held, ctx.policy)) continue;

    reasons.add(
      rule.type === 'DOES_NOT_HAVE_ALL' ? 'DISALLOWED_QUALIFICATION' : 'MISSING_QUALIFICATION',
    );
  }

  return [...reasons];
}
