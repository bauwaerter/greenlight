import { describe, expect, it } from 'vitest';
import { buildDataset, loadDataset, UnknownRecordError } from '../src/dataset.js';
import { createChecker } from '../src/eligibility.js';
import { DEFAULT_POLICY } from '../src/policy.js';
import { FIXTURE_PATH } from './helpers.js';

const dataset = loadDataset(FIXTURE_PATH);
const checker = createChecker(dataset);

describe('DISALLOWED_QUALIFICATION (never covered by fixtures/cases.json)', () => {
  it('blocks Fern from the warehouse loader opening', () => {
    // OBSERVATIONS.md §1.1 — the decision this whole exercise turns on. Under the
    // literal SPEC.md rule table Fern would be ELIGIBLE here.
    expect(checker.checkEligibility('vol-006', 'open-warehouse-mon-loader')).toEqual({
      status: 'BLOCKED',
      reasons: ['DISALLOWED_QUALIFICATION'],
    });
  });

  it('clears Fern under the literal reading, documenting the contradiction', () => {
    const literal = createChecker(dataset, {
      ...DEFAULT_POLICY,
      disallowedQualificationSemantics: 'ALL',
    });
    expect(literal.checkEligibility('vol-006', 'open-warehouse-mon-loader')).toEqual({
      status: 'ELIGIBLE',
      reasons: [],
    });
  });
});

describe('GROUP_RESTRICTED (never covered by fixtures/cases.json)', () => {
  it('blocks with an empty reasons list and never emits the code', () => {
    // SPEC.md rule 5: membership is confidential.
    const result = checker.checkEligibility('vol-002', 'open-kitchen-sat-cleaner');
    expect(result).toEqual({ status: 'BLOCKED', reasons: [] });
    expect(result.reasons).not.toContain('GROUP_RESTRICTED');
  });

  it('suppresses every other reason it would otherwise have reported', () => {
    // OBSERVATIONS.md §1.2. vol-005 is in group-youth, not group-acme, AND has not
    // signed waiver-kitchen. Leaking WAIVER_REQUIRED would send them off to sign a
    // waiver that changes nothing.
    expect(checker.checkEligibility('vol-005', 'open-kitchen-sat-cleaner')).toEqual({
      status: 'BLOCKED',
      reasons: [],
    });
  });

  it('evaluates normally for a member of the restricted group', () => {
    // OBSERVATIONS.md §3.4: no volunteer in the fixture is both in group-acme and a
    // current signer of waiver-kitchen, so vol-001 gets through the gate and is then
    // blocked on the waiver. That is the correct behaviour, not a bug.
    expect(checker.checkEligibility('vol-001', 'open-kitchen-sat-cleaner')).toEqual({
      status: 'BLOCKED',
      reasons: ['WAIVER_REQUIRED'],
    });
  });
});

describe('WAITLIST_FULL (never covered by fixtures/cases.json)', () => {
  it('blocks when the opening and its waitlist are both full', () => {
    const data = structuredClone(dataset.raw);
    data.signups.push({
      volunteerId: 'vol-005',
      openingId: 'open-meals-tue-server',
      state: 'WAITLISTED',
    });
    // vol-007 holds no food safety certification either, so both reasons apply.
    expect(
      createChecker(buildDataset(data)).checkEligibility('vol-007', 'open-meals-tue-server'),
    ).toEqual({
      status: 'BLOCKED',
      reasons: ['MISSING_QUALIFICATION', 'WAITLIST_FULL'],
    });
  });
});

describe('reason accumulation', () => {
  it('returns every reason that applies, not the first', () => {
    // An unpublished AND cancelled shift on a retired opening, for a volunteer who is
    // unqualified and unwaivered. SPEC.md: "A volunteer missing two things should be
    // told about both."
    const data = structuredClone(dataset.raw);
    const shift = data.shifts.find((candidate) => candidate.id === 'shift-meals-tue');
    if (!shift) throw new Error('fixture changed: shift-meals-tue missing');
    shift.isPublished = false;
    shift.isActive = false;

    expect(
      createChecker(buildDataset(data)).checkEligibility('vol-003', 'open-meals-tue-retired'),
    ).toEqual({
      status: 'BLOCKED',
      reasons: [
        'MISSING_QUALIFICATION',
        'OPENING_INACTIVE',
        'SHIFT_INACTIVE',
        'SHIFT_NOT_PUBLISHED',
        'WAIVER_REQUIRED',
      ],
    });
  });

  it('never returns a duplicate reason code', () => {
    const result = checker.checkEligibility('vol-003', 'open-meals-mon-pm-server');
    expect(new Set(result.reasons).size).toBe(result.reasons.length);
  });

  it('returns reasons sorted ascending', () => {
    const result = checker.checkEligibility('vol-003', 'open-meals-mon-pm-server');
    expect(result.reasons).toEqual([...result.reasons].sort());
  });
});

describe('status derivation', () => {
  it('prefers BLOCKED over WAITLIST when a blocking reason applies', () => {
    // OBSERVATIONS.md §2.1. open-meals-tue-server has a waitlist place free, but
    // vol-007 holds no food safety certification.
    expect(checker.checkEligibility('vol-007', 'open-meals-tue-server')).toEqual({
      status: 'BLOCKED',
      reasons: ['MISSING_QUALIFICATION'],
    });
  });

  it('returns WAITLIST with no reasons when only capacity stands in the way', () => {
    expect(checker.checkEligibility('vol-001', 'open-meals-tue-server')).toEqual({
      status: 'WAITLIST',
      reasons: [],
    });
  });
});

describe('self-conflict', () => {
  it('reports ALREADY_SIGNED_UP without a spurious SCHEDULE_CONFLICT', () => {
    // OBSERVATIONS.md §2.2.
    expect(checker.checkEligibility('vol-002', 'open-meals-mon-am-server')).toEqual({
      status: 'BLOCKED',
      reasons: ['ALREADY_SIGNED_UP'],
    });
  });
});

describe('adjacent shifts', () => {
  it('allows back-to-back shifts that touch but do not overlap', () => {
    // OBSERVATIONS.md §2.3. vol-002 is confirmed on Monday Lunch Prep (09:00-12:00)
    // and Monday Lunch Service starts at 12:00. They hold the qualification and the
    // waiver, so this must come back ELIGIBLE.
    expect(checker.checkEligibility('vol-002', 'open-meals-mon-pm-server')).toEqual({
      status: 'ELIGIBLE',
      reasons: [],
    });
  });
});

describe('unknown identifiers', () => {
  it('throws rather than returning BLOCKED for an unknown volunteer', () => {
    // OBSERVATIONS.md §2.7: a missing record is a data fault, not an eligibility answer.
    expect(() => checker.checkEligibility('vol-999', 'open-meals-mon-pm-server')).toThrow(
      UnknownRecordError,
    );
  });

  it('throws rather than returning BLOCKED for an unknown opening', () => {
    expect(() => checker.checkEligibility('vol-001', 'open-nope')).toThrow(UnknownRecordError);
  });
});

describe('staff audience', () => {
  const staff = createChecker(dataset, DEFAULT_POLICY, 'STAFF');

  it('emits GROUP_RESTRICTED where the volunteer sees nothing', () => {
    // OBSERVATIONS.md §1.2. Same evaluation, different audience: a coordinator has
    // to be able to explain the refusal the volunteer was not given.
    expect(checker.checkEligibility('vol-002', 'open-kitchen-sat-cleaner')).toEqual({
      status: 'BLOCKED',
      reasons: [],
    });
    // vol-002 is the one volunteer holding a current waiver-kitchen signature, so
    // the group restriction is the *only* thing standing in their way.
    expect(staff.checkEligibility('vol-002', 'open-kitchen-sat-cleaner')).toEqual({
      status: 'BLOCKED',
      reasons: ['GROUP_RESTRICTED'],
    });
  });

  it('reports the other applicable reasons alongside it', () => {
    // vol-005 is in the wrong group AND has not signed waiver-kitchen. The volunteer
    // is told neither; staff are told both.
    expect(staff.checkEligibility('vol-005', 'open-kitchen-sat-cleaner').reasons).toEqual([
      'GROUP_RESTRICTED',
      'WAIVER_REQUIRED',
    ]);
  });

  it('changes nothing for an unrestricted opportunity', () => {
    for (const volunteerId of dataset.raw.volunteers.map((v) => v.id)) {
      for (const opportunityId of ['opp-meals', 'opp-warehouse', 'opp-youth']) {
        expect(staff.checkOpportunity(volunteerId, opportunityId)).toEqual(
          checker.checkOpportunity(volunteerId, opportunityId),
        );
      }
    }
  });

  it('defaults to the volunteer audience', () => {
    expect(createChecker(dataset).checkEligibility('vol-002', 'open-kitchen-sat-cleaner')).toEqual(
      createChecker(dataset, DEFAULT_POLICY, 'VOLUNTEER').checkEligibility(
        'vol-002',
        'open-kitchen-sat-cleaner',
      ),
    );
  });

  it('never emits GROUP_RESTRICTED to a volunteer for any opening in the fixture', () => {
    // The guarantee that matters: the volunteer path returns before any rule runs,
    // so the code cannot leak through a future rule change.
    for (const volunteer of dataset.raw.volunteers) {
      for (const opening of dataset.raw.openings) {
        expect(
          checker.checkEligibility(volunteer.id, opening.id).reasons,
        ).not.toContain('GROUP_RESTRICTED');
      }
    }
  });
});
