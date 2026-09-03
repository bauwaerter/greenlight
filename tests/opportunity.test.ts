import { describe, expect, it, vi } from 'vitest';
import { buildDataset, loadDataset, UnknownRecordError } from '../src/dataset.js';
import { createChecker } from '../src/eligibility.js';
import { FIXTURE_PATH } from './helpers.js';

const dataset = loadDataset(FIXTURE_PATH);
const checker = createChecker(dataset);

describe('checkOpportunity', () => {
  it('returns a result for every opening under the opportunity', () => {
    const results = checker.checkOpportunity('vol-001', 'opp-warehouse');
    expect(Object.keys(results).sort()).toEqual([
      'open-warehouse-mon-late-loader',
      'open-warehouse-mon-loader',
    ]);
  });

  it('agrees with checkEligibility opening by opening', () => {
    for (const opportunityId of ['opp-meals', 'opp-warehouse', 'opp-youth', 'opp-kitchen']) {
      for (const volunteerId of dataset.raw.volunteers.map((volunteer) => volunteer.id)) {
        const bulk = checker.checkOpportunity(volunteerId, opportunityId);
        for (const [openingId, result] of Object.entries(bulk)) {
          expect(result, `${volunteerId} / ${openingId}`).toEqual(
            checker.checkEligibility(volunteerId, openingId),
          );
        }
      }
    }
  });

  it('covers every opening in the fixture across all opportunities', () => {
    const seen = new Set<string>();
    for (const opportunity of dataset.raw.opportunities) {
      for (const openingId of Object.keys(checker.checkOpportunity('vol-001', opportunity.id))) {
        seen.add(openingId);
      }
    }
    expect(seen.size).toBe(dataset.raw.openings.length);
  });

  it('resolves the volunteer once regardless of how many openings are checked', () => {
    // This is the entire point of the bulk API. opp-meals has 6 openings.
    const spy = vi.spyOn(dataset, 'volunteer');
    createChecker(dataset).checkOpportunity('vol-001', 'opp-meals');
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it('returns an empty object for an opportunity with no openings', () => {
    // Not an error: an opportunity may exist before any shifts are scheduled.
    const data = structuredClone(dataset.raw);
    data.opportunities.push({
      id: 'opp-empty',
      organizationId: 'org-1',
      name: 'Not Yet Scheduled',
      city: 'Indianapolis',
      requiredWaiverId: null,
      restrictedToGroupIds: [],
      qualificationRules: [],
    });
    expect(createChecker(buildDataset(data)).checkOpportunity('vol-001', 'opp-empty')).toEqual({});
  });

  it('throws for an unknown volunteer', () => {
    expect(() => checker.checkOpportunity('vol-999', 'opp-meals')).toThrow(UnknownRecordError);
  });
});
