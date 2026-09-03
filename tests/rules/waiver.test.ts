import { describe, expect, it } from 'vitest';
import { buildVolunteerContext, resolveTarget } from '../../src/context.js';
import type { EvalContext } from '../../src/context.js';
import { buildDataset, loadDataset } from '../../src/dataset.js';
import type { Dataset } from '../../src/dataset.js';
import { DEFAULT_POLICY } from '../../src/policy.js';
import type { PolicyConfig } from '../../src/policy.js';
import { waiverRule } from '../../src/rules/waiver.js';
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

describe('waiverRule', () => {
  it('passes when the opportunity requires no waiver', () => {
    // opp-warehouse has requiredWaiverId: null.
    expect(waiverRule(contextFor('vol-003', 'open-warehouse-mon-loader'))).toEqual([]);
  });

  it('passes with a signature at the current version', () => {
    // vol-001 signed waiver-general v2; current is v2.
    expect(waiverRule(contextFor('vol-001', 'open-meals-mon-pm-server'))).toEqual([]);
  });

  it('fails with no signature at all', () => {
    expect(waiverRule(contextFor('vol-003', 'open-meals-mon-pm-server'))).toEqual([
      'WAIVER_REQUIRED',
    ]);
  });

  it('fails with a signature at an older version', () => {
    // vol-006 signed waiver-general v1; current is v2. The text changed.
    expect(waiverRule(contextFor('vol-006', 'open-meals-mon-pm-server'))).toEqual([
      'WAIVER_REQUIRED',
    ]);
  });

  it('fails when the volunteer signed a different waiver', () => {
    // opp-kitchen requires waiver-kitchen; vol-001 signed only waiver-general.
    expect(waiverRule(contextFor('vol-001', 'open-kitchen-sat-cleaner'))).toEqual([
      'WAIVER_REQUIRED',
    ]);
  });

  it('accepts a signature newer than the current version by default', () => {
    // OBSERVATIONS.md §2.6: happens when a waiver revision is rolled back.
    const data = structuredClone(dataset.raw);
    const waiver = data.waivers.find((candidate) => candidate.id === 'waiver-general');
    if (!waiver) throw new Error('fixture changed: waiver-general missing');
    waiver.currentVersion = 1; // vol-001 holds v2.

    expect(
      waiverRule(contextFor('vol-001', 'open-meals-mon-pm-server', DEFAULT_POLICY, buildDataset(data))),
    ).toEqual([]);
  });

  it('rejects a newer signature under strict-equality policy', () => {
    const data = structuredClone(dataset.raw);
    const waiver = data.waivers.find((candidate) => candidate.id === 'waiver-general');
    if (!waiver) throw new Error('fixture changed: waiver-general missing');
    waiver.currentVersion = 1;

    const policy: PolicyConfig = { ...DEFAULT_POLICY, acceptNewerWaiverVersions: false };
    expect(
      waiverRule(contextFor('vol-001', 'open-meals-mon-pm-server', policy, buildDataset(data))),
    ).toEqual(['WAIVER_REQUIRED']);
  });
});
