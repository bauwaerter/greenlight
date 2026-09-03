import { describe, expect, it } from 'vitest';
import { buildVolunteerContext, resolveTarget } from '../../src/context.js';
import type { EvalContext } from '../../src/context.js';
import { buildDataset, loadDataset } from '../../src/dataset.js';
import type { Dataset } from '../../src/dataset.js';
import { DEFAULT_POLICY } from '../../src/policy.js';
import { isGroupRestricted } from '../../src/rules/groups.js';
import { FIXTURE_PATH } from '../helpers.js';

const dataset = loadDataset(FIXTURE_PATH);

function contextFor(volunteerId: string, openingId: string, data: Dataset = dataset): EvalContext {
  return {
    dataset: data,
    policy: DEFAULT_POLICY,
    volunteer: buildVolunteerContext(data, volunteerId, DEFAULT_POLICY),
    target: resolveTarget(data, openingId),
  };
}

describe('isGroupRestricted', () => {
  it('is false when the opportunity restricts nothing', () => {
    expect(isGroupRestricted(contextFor('vol-003', 'open-meals-mon-pm-server'))).toBe(false);
  });

  it('is false for a member of a listed group', () => {
    // opp-kitchen is restricted to group-acme; vol-001 is a member.
    expect(isGroupRestricted(contextFor('vol-001', 'open-kitchen-sat-cleaner'))).toBe(false);
  });

  it('is true for a volunteer in no listed group', () => {
    // vol-002 belongs to no groups at all.
    expect(isGroupRestricted(contextFor('vol-002', 'open-kitchen-sat-cleaner'))).toBe(true);
  });

  it('is true for a volunteer in a different group', () => {
    // vol-005 is in group-youth, not group-acme.
    expect(isGroupRestricted(contextFor('vol-005', 'open-kitchen-sat-cleaner'))).toBe(true);
  });

  it('is false when the volunteer matches any one of several listed groups', () => {
    const data = structuredClone(dataset.raw);
    const opportunity = data.opportunities.find((candidate) => candidate.id === 'opp-kitchen');
    if (!opportunity) throw new Error('fixture changed: opp-kitchen missing');
    opportunity.restrictedToGroupIds = ['group-acme', 'group-youth'];

    expect(isGroupRestricted(contextFor('vol-005', 'open-kitchen-sat-cleaner', buildDataset(data)))).toBe(
      false,
    );
  });
});
