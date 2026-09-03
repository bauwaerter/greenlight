import type { EvalContext } from '../context.js';
import type { ReasonCode } from '../types.js';
import { capacityRule } from './capacity.js';
import { qualificationRule } from './qualifications.js';
import { scheduleRule } from './schedule.js';
import { statusRule } from './status.js';
import { waiverRule } from './waiver.js';

export type Rule = (ctx: EvalContext) => ReasonCode[];

/**
 * Every rule runs. SPEC.md: "Return every reason that applies, not just the first
 * one." Adding a rule to this array is the whole cost of adding a rule.
 *
 * The group gate is deliberately absent — it is not a rule. See rules/groups.ts.
 */
export const RULES: Rule[] = [
  statusRule,
  capacityRule,
  qualificationRule,
  waiverRule,
  scheduleRule,
];

export { assessCapacity } from './capacity.js';
export { isGroupRestricted } from './groups.js';
