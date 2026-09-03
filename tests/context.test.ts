import { describe, expect, it } from 'vitest';
import { buildVolunteerContext, resolveTarget } from '../src/context.js';
import { buildDataset, loadDataset } from '../src/dataset.js';
import { DEFAULT_POLICY } from '../src/policy.js';
import { FIXTURE_PATH } from './helpers.js';

const dataset = loadDataset(FIXTURE_PATH);

describe('resolveTarget', () => {
  it('walks opening to shift to opportunity', () => {
    const target = resolveTarget(dataset, 'open-warehouse-mon-loader');
    expect(target.opening.roleName).toBe('Loader');
    expect(target.shift.id).toBe('shift-warehouse-mon');
    expect(target.opportunity.id).toBe('opp-warehouse');
  });
});

describe('buildVolunteerContext', () => {
  it('collects qualifications, groups, and waiver versions into lookups', () => {
    const ctx = buildVolunteerContext(dataset, 'vol-006', DEFAULT_POLICY);
    expect(ctx.qualifications.has('qual-lifting-restriction')).toBe(true);
    expect(ctx.qualifications.has('qual-minor')).toBe(false);
    expect(ctx.groups.size).toBe(0);
    // Fern signed the general waiver at v1; current is v2.
    expect(ctx.waiverVersions.get('waiver-general')).toBe(1);
  });

  it('indexes the volunteer own signups by opening', () => {
    const ctx = buildVolunteerContext(dataset, 'vol-002', DEFAULT_POLICY);
    expect(ctx.signupsByOpening.get('open-meals-mon-am-server')).toBe('CONFIRMED');
    expect(ctx.signupsByOpening.get('open-warehouse-mon-loader')).toBeUndefined();
  });

  it('records only confirmed signups as committed shifts', () => {
    // vol-003 holds a WAITLISTED place on open-meals-tue-server and nothing else.
    // SPEC.md rule 6: only confirmed signups block.
    const ctx = buildVolunteerContext(dataset, 'vol-003', DEFAULT_POLICY);
    expect(ctx.confirmedShifts).toEqual([]);
  });

  it('excludes confirmed signups on cancelled shifts', () => {
    // OBSERVATIONS.md §2.5. No fixture data covers this, so construct it.
    const data = structuredClone(dataset.raw);
    data.signups.push({
      volunteerId: 'vol-001',
      openingId: 'open-meals-cancelled-server',
      state: 'CONFIRMED',
    });
    const ctx = buildVolunteerContext(buildDataset(data), 'vol-001', DEFAULT_POLICY);
    expect(ctx.confirmedShifts).toEqual([]);
  });

  it('keeps confirmed signups on cancelled shifts when policy says to', () => {
    const data = structuredClone(dataset.raw);
    data.signups.push({
      volunteerId: 'vol-001',
      openingId: 'open-meals-cancelled-server',
      state: 'CONFIRMED',
    });
    const ctx = buildVolunteerContext(buildDataset(data), 'vol-001', {
      ...DEFAULT_POLICY,
      ignoreConflictsOnInactiveShifts: false,
    });
    expect(ctx.confirmedShifts.map((entry) => entry.shift.id)).toEqual(['shift-meals-cancelled']);
  });
});
