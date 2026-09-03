import { describe, expect, it } from 'vitest';
import { loadDataset } from '../src/dataset.js';
import { createChecker } from '../src/eligibility.js';
import { DEFAULT_POLICY } from '../src/policy.js';
import { buildVolunteerReport, listVolunteers } from '../src/report.js';
import { FIXTURE_PATH } from './helpers.js';

const dataset = loadDataset(FIXTURE_PATH);

describe('listVolunteers', () => {
  it('returns every volunteer, id and name, in fixture order', () => {
    const listed = listVolunteers(dataset);
    expect(listed).toHaveLength(8);
    expect(listed[0]).toEqual({ id: 'vol-001', name: 'Avery Chen' });
    expect(listed.at(-1)).toEqual({ id: 'vol-008', name: 'Hana Bergstrom' });
  });
});

describe('buildVolunteerReport', () => {
  it('covers every opportunity that has openings', () => {
    const report = buildVolunteerReport(dataset, 'vol-001');
    expect(report.opportunities.map((o) => o.opportunityId)).toEqual([
      'opp-meals',
      'opp-warehouse',
      'opp-youth',
      'opp-kitchen',
    ]);
  });

  it('accounts for every opening in the fixture exactly once', () => {
    const report = buildVolunteerReport(dataset, 'vol-001');
    const ids = report.opportunities.flatMap((o) => o.rows.map((r) => r.openingId));
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(dataset.raw.openings.length);
  });

  it('labels each row with its shift title and role', () => {
    const report = buildVolunteerReport(dataset, 'vol-006');
    const warehouse = report.opportunities.find((o) => o.opportunityId === 'opp-warehouse');
    expect(warehouse?.rows[0]).toMatchObject({
      openingId: 'open-warehouse-mon-loader',
      label: 'Monday Sort · Loader',
      status: 'BLOCKED',
      reasons: ['DISALLOWED_QUALIFICATION'],
    });
  });

  it('carries the volunteer name, city, and audience through', () => {
    const report = buildVolunteerReport(dataset, 'vol-006');
    expect(report.name).toBe('Fern Okonjo');
    expect(report.audience).toBe('VOLUNTEER');
    expect(report.opportunities.find((o) => o.opportunityId === 'opp-warehouse')?.city).toBe(
      'Denver',
    );
  });

  it('agrees with checkEligibility for every volunteer and every opening', () => {
    // The report must never become a second implementation of the rules.
    const checker = createChecker(dataset);
    for (const volunteer of dataset.raw.volunteers) {
      const report = buildVolunteerReport(dataset, volunteer.id);
      for (const opportunity of report.opportunities) {
        for (const row of opportunity.rows) {
          expect(
            { status: row.status, reasons: row.reasons },
            `${volunteer.id} / ${row.openingId}`,
          ).toEqual(checker.checkEligibility(volunteer.id, row.openingId));
        }
      }
    }
  });

  it('withholds the group reason from a volunteer and keeps it for staff', () => {
    const kitchenRow = (audience: 'VOLUNTEER' | 'STAFF') =>
      buildVolunteerReport(dataset, 'vol-005', { audience }).opportunities.find(
        (o) => o.opportunityId === 'opp-kitchen',
      )?.rows[0];

    expect(kitchenRow('VOLUNTEER')).toMatchObject({ status: 'BLOCKED', reasons: [] });
    expect(kitchenRow('STAFF')).toMatchObject({
      status: 'BLOCKED',
      reasons: ['GROUP_RESTRICTED', 'WAIVER_REQUIRED'],
    });
  });

  it('honours a policy override', () => {
    const literal = buildVolunteerReport(dataset, 'vol-006', {
      policy: { ...DEFAULT_POLICY, disallowedQualificationSemantics: 'ALL' },
    });
    const row = literal.opportunities
      .find((o) => o.opportunityId === 'opp-warehouse')
      ?.rows.find((r) => r.openingId === 'open-warehouse-mon-loader');
    expect(row).toMatchObject({ status: 'ELIGIBLE', reasons: [] });
  });

  it('summarises how many openings the volunteer can actually take', () => {
    // vol-007 holds forklift and a licence but no food safety certification.
    const report = buildVolunteerReport(dataset, 'vol-007');
    expect(report.summary).toEqual({ eligible: 3, waitlist: 0, blocked: 8 });
  });
});
