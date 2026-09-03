import { describe, expect, it } from 'vitest';
import { buildVolunteerContext, resolveTarget } from '../../src/context.js';
import type { EvalContext } from '../../src/context.js';
import { buildDataset, loadDataset } from '../../src/dataset.js';
import type { Dataset } from '../../src/dataset.js';
import { DEFAULT_POLICY } from '../../src/policy.js';
import type { PolicyConfig } from '../../src/policy.js';
import { assessCapacity, capacityRule } from '../../src/rules/capacity.js';
import { FIXTURE_PATH } from '../helpers.js';

const dataset = loadDataset(FIXTURE_PATH);

function contextFor(
  volunteerId: string,
  openingId: string,
  policy: PolicyConfig = DEFAULT_POLICY,
  data: Dataset = dataset,
): EvalContext {
  return {
    dataset: data,
    policy,
    volunteer: buildVolunteerContext(data, volunteerId, policy),
    target: resolveTarget(data, openingId),
  };
}

describe('assessCapacity', () => {
  it('reports OPEN when confirmed signups are below maxVolunteers', () => {
    // open-meals-mon-pm-server: max 4, nobody confirmed.
    expect(assessCapacity(contextFor('vol-001', 'open-meals-mon-pm-server'))).toEqual({
      outcome: 'OPEN',
      confirmed: 0,
      waitlisted: 0,
    });
  });

  it('reports WAITLIST when full but the waitlist has room', () => {
    // open-meals-tue-server: max 2, 2 confirmed, waitlistMax 2, 1 waitlisted.
    expect(assessCapacity(contextFor('vol-001', 'open-meals-tue-server'))).toEqual({
      outcome: 'WAITLIST',
      confirmed: 2,
      waitlisted: 1,
    });
  });

  it('reports FULL when full and there is no waitlist', () => {
    // open-meals-tue-full: max 1, 1 confirmed, waitlistMax 0.
    expect(assessCapacity(contextFor('vol-001', 'open-meals-tue-full')).outcome).toBe('FULL');
  });

  it('counts only CONFIRMED signups against maxVolunteers', () => {
    // The waitlisted vol-003 must not consume one of the two confirmed places.
    const assessment = assessCapacity(contextFor('vol-001', 'open-meals-tue-server'));
    expect(assessment.confirmed).toBe(2);
  });
});

describe('capacityRule', () => {
  it('returns nothing when a place is available', () => {
    expect(capacityRule(contextFor('vol-001', 'open-meals-mon-pm-server'))).toEqual([]);
  });

  it('returns nothing when a waitlist place is available', () => {
    // WAITLIST is a status, not a reason. SPEC.md's own case expects empty reasons.
    expect(capacityRule(contextFor('vol-001', 'open-meals-tue-server'))).toEqual([]);
  });

  it('returns AT_CAPACITY when full with no waitlist configured', () => {
    expect(capacityRule(contextFor('vol-001', 'open-meals-tue-full'))).toEqual(['AT_CAPACITY']);
  });

  it('returns WAITLIST_FULL when both the opening and its waitlist are full', () => {
    // No fixture covers WAITLIST_FULL, so fill the waitlist on open-meals-tue-server.
    const data = structuredClone(dataset.raw);
    data.signups.push({
      volunteerId: 'vol-005',
      openingId: 'open-meals-tue-server',
      state: 'WAITLISTED',
    });
    expect(
      capacityRule(contextFor('vol-001', 'open-meals-tue-server', DEFAULT_POLICY, buildDataset(data))),
    ).toEqual(['WAITLIST_FULL']);
  });

  it('returns ALREADY_SIGNED_UP for a confirmed signup on this opening', () => {
    expect(capacityRule(contextFor('vol-002', 'open-meals-mon-am-server'))).toEqual([
      'ALREADY_SIGNED_UP',
    ]);
  });

  it('returns ALREADY_SIGNED_UP for a waitlisted signup by default', () => {
    // OBSERVATIONS.md §2.4. vol-003 is WAITLISTED on open-meals-tue-server.
    expect(capacityRule(contextFor('vol-003', 'open-meals-tue-server'))).toEqual([
      'ALREADY_SIGNED_UP',
    ]);
  });

  it('treats a waitlisted signup as not signed up when policy says so', () => {
    const policy = { ...DEFAULT_POLICY, waitlistedCountsAsSignedUp: false };
    // Falls through to the capacity check: full with waitlist room, so no reason.
    expect(capacityRule(contextFor('vol-003', 'open-meals-tue-server', policy))).toEqual([]);
  });
});
