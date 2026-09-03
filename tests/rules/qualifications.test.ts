import { describe, expect, it } from 'vitest';
import { buildVolunteerContext, resolveTarget } from '../../src/context.js';
import type { EvalContext } from '../../src/context.js';
import { buildDataset, loadDataset } from '../../src/dataset.js';
import type { Dataset } from '../../src/dataset.js';
import { DEFAULT_POLICY } from '../../src/policy.js';
import type { PolicyConfig } from '../../src/policy.js';
import { qualificationRule } from '../../src/rules/qualifications.js';
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
    audience: 'VOLUNTEER',
  };
}

describe('HAS_ALL', () => {
  it('passes when the volunteer holds every listed qualification', () => {
    // opp-meals requires qual-food-safety; vol-001 holds it.
    expect(qualificationRule(contextFor('vol-001', 'open-meals-mon-pm-server'))).toEqual([]);
  });

  it('fails with MISSING_QUALIFICATION when one is absent', () => {
    // vol-003 holds nothing.
    expect(qualificationRule(contextFor('vol-003', 'open-meals-mon-pm-server'))).toEqual([
      'MISSING_QUALIFICATION',
    ]);
  });

  it('passes vacuously when the rule lists no qualifications', () => {
    // OBSERVATIONS.md §3.3: opp-youth carries a HAS_ALL rule with an empty list.
    // Treated as a misconfiguration that passes, not as a block-everyone rule.
    expect(qualificationRule(contextFor('vol-003', 'open-youth-tue-mentor'))).toEqual([]);
  });
});

describe('HAS_ANY', () => {
  it('passes when the volunteer holds at least one listed qualification', () => {
    // opp-warehouse wants forklift OR driver's licence; vol-007 holds forklift.
    expect(qualificationRule(contextFor('vol-007', 'open-warehouse-mon-loader'))).toEqual([]);
  });

  it('fails with MISSING_QUALIFICATION when the volunteer holds none of them', () => {
    // vol-008 holds background check and first aid — neither is listed.
    expect(qualificationRule(contextFor('vol-008', 'open-warehouse-mon-loader'))).toEqual([
      'MISSING_QUALIFICATION',
    ]);
  });
});

describe('DOES_NOT_HAVE_ALL', () => {
  it('blocks a volunteer holding ANY listed qualification under the default policy', () => {
    // OBSERVATIONS.md §1.1. vol-006 (Fern) holds the lifting restriction but is not
    // under 18. SPEC.md's rule table says she passes; SPEC.md's worked example says
    // she is blocked. The default policy follows the example and the safety intent.
    expect(qualificationRule(contextFor('vol-006', 'open-warehouse-mon-loader'))).toEqual([
      'DISALLOWED_QUALIFICATION',
    ]);
  });

  it('lets that same volunteer through under the literal ALL reading', () => {
    const policy: PolicyConfig = { ...DEFAULT_POLICY, disallowedQualificationSemantics: 'ALL' };
    expect(qualificationRule(contextFor('vol-006', 'open-warehouse-mon-loader', policy))).toEqual(
      [],
    );
  });

  it('blocks a volunteer holding every listed qualification under either reading', () => {
    const data = structuredClone(dataset.raw);
    const volunteer = data.volunteers.find((candidate) => candidate.id === 'vol-006');
    if (!volunteer) throw new Error('fixture changed: vol-006 missing');
    volunteer.qualificationIds.push('qual-minor');

    for (const semantics of ['ANY', 'ALL'] as const) {
      expect(
        qualificationRule(
          contextFor(
            'vol-006',
            'open-warehouse-mon-loader',
            { ...DEFAULT_POLICY, disallowedQualificationSemantics: semantics },
            buildDataset(data),
          ),
        ),
      ).toEqual(['DISALLOWED_QUALIFICATION']);
    }
  });

  it('passes a volunteer holding none of the listed qualifications', () => {
    // vol-007 holds neither qual-minor nor qual-lifting-restriction.
    expect(qualificationRule(contextFor('vol-007', 'open-warehouse-mon-loader'))).toEqual([]);
  });
});

describe('rule combination', () => {
  it('skips inactive rules', () => {
    const data = structuredClone(dataset.raw);
    const opportunity = data.opportunities.find((candidate) => candidate.id === 'opp-warehouse');
    if (!opportunity) throw new Error('fixture changed: opp-warehouse missing');
    for (const rule of opportunity.qualificationRules) rule.isActive = false;

    // vol-008 fails the HAS_ANY rule when it is active; deactivated, nothing applies.
    expect(
      qualificationRule(
        contextFor('vol-008', 'open-warehouse-mon-loader', DEFAULT_POLICY, buildDataset(data)),
      ),
    ).toEqual([]);
  });

  it('reports MISSING_QUALIFICATION once even when several rules fail', () => {
    const data = structuredClone(dataset.raw);
    const opportunity = data.opportunities.find((candidate) => candidate.id === 'opp-meals');
    if (!opportunity) throw new Error('fixture changed: opp-meals missing');
    opportunity.qualificationRules.push({
      id: 'rule-meals-2',
      type: 'HAS_ANY',
      qualificationIds: ['qual-forklift'],
      isActive: true,
    });

    // OBSERVATIONS.md §2.8: reasons are a set.
    expect(
      qualificationRule(
        contextFor('vol-003', 'open-meals-mon-pm-server', DEFAULT_POLICY, buildDataset(data)),
      ),
    ).toEqual(['MISSING_QUALIFICATION']);
  });

  it('reports both codes when a missing rule and a disallowed rule fail together', () => {
    const data = structuredClone(dataset.raw);
    // vol-006 fails DOES_NOT_HAVE_ALL already; strip her driver's licence so the
    // HAS_ANY rule fails too. SPEC.md: return every reason that applies.
    const volunteer = data.volunteers.find((candidate) => candidate.id === 'vol-006');
    if (!volunteer) throw new Error('fixture changed: vol-006 missing');
    volunteer.qualificationIds = volunteer.qualificationIds.filter(
      (id) => id !== 'qual-drivers-license',
    );

    expect(
      qualificationRule(
        contextFor('vol-006', 'open-warehouse-mon-loader', DEFAULT_POLICY, buildDataset(data)),
      ).sort(),
    ).toEqual(['DISALLOWED_QUALIFICATION', 'MISSING_QUALIFICATION']);
  });

  it('passes when the opportunity carries no rules at all', () => {
    // opp-kitchen has an empty qualificationRules array.
    expect(qualificationRule(contextFor('vol-001', 'open-kitchen-sat-cleaner'))).toEqual([]);
  });
});
