import { describe, expect, it } from 'vitest';
import { buildVolunteerContext, resolveTarget } from '../../src/context.js';
import type { EvalContext } from '../../src/context.js';
import { loadDataset } from '../../src/dataset.js';
import { DEFAULT_POLICY } from '../../src/policy.js';
import { statusRule } from '../../src/rules/status.js';
import { FIXTURE_PATH } from '../helpers.js';

const dataset = loadDataset(FIXTURE_PATH);

function contextFor(volunteerId: string, openingId: string): EvalContext {
  return {
    dataset,
    policy: DEFAULT_POLICY,
    volunteer: buildVolunteerContext(dataset, volunteerId, DEFAULT_POLICY),
    target: resolveTarget(dataset, openingId),
    audience: 'VOLUNTEER',
  };
}

describe('statusRule', () => {
  it('returns nothing for a published, active shift with an active opening', () => {
    expect(statusRule(contextFor('vol-001', 'open-meals-mon-pm-server'))).toEqual([]);
  });

  it('flags an unpublished shift', () => {
    expect(statusRule(contextFor('vol-001', 'open-meals-draft-server'))).toEqual([
      'SHIFT_NOT_PUBLISHED',
    ]);
  });

  it('flags a cancelled shift', () => {
    expect(statusRule(contextFor('vol-001', 'open-meals-cancelled-server'))).toEqual([
      'SHIFT_INACTIVE',
    ]);
  });

  it('flags a retired opening', () => {
    expect(statusRule(contextFor('vol-002', 'open-meals-tue-retired'))).toEqual([
      'OPENING_INACTIVE',
    ]);
  });
});
