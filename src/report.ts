import { createChecker } from './eligibility.js';
import type { Dataset } from './dataset.js';
import { DEFAULT_POLICY } from './policy.js';
import type { PolicyConfig } from './policy.js';
import type { Audience, EligibilityStatus, ReasonCode } from './types.js';

export interface ReportRow {
  openingId: string;
  /** "Shift title · Role name", resolved here so a renderer needs no lookups. */
  label: string;
  status: EligibilityStatus;
  reasons: ReasonCode[];
}

export interface OpportunityReport {
  opportunityId: string;
  name: string;
  city: string;
  rows: ReportRow[];
}

export interface ReportSummary {
  eligible: number;
  waitlist: number;
  blocked: number;
}

export interface VolunteerReport {
  volunteerId: string;
  name: string;
  audience: Audience;
  opportunities: OpportunityReport[];
  summary: ReportSummary;
}

export interface ReportOptions {
  policy?: PolicyConfig;
  audience?: Audience;
}

export function listVolunteers(dataset: Dataset): { id: string; name: string }[] {
  return dataset.raw.volunteers.map(({ id, name }) => ({ id, name }));
}

/**
 * Everything one volunteer would see across the whole catalog, resolved to labels and
 * counted, with no rendering decisions made.
 *
 * This is a presentation layer and nothing more: every status and reason on it comes
 * from checkOpportunity. It must never decide eligibility itself — a test asserts row
 * by row that it agrees with checkEligibility for every volunteer in the fixture.
 */
export function buildVolunteerReport(
  dataset: Dataset,
  volunteerId: string,
  options: ReportOptions = {},
): VolunteerReport {
  const { policy = DEFAULT_POLICY, audience = 'VOLUNTEER' } = options;
  const volunteer = dataset.volunteer(volunteerId);
  const checker = createChecker(dataset, policy, audience);

  const summary: ReportSummary = { eligible: 0, waitlist: 0, blocked: 0 };
  const opportunities: OpportunityReport[] = [];

  for (const opportunity of dataset.raw.opportunities) {
    const results = checker.checkOpportunity(volunteerId, opportunity.id);
    const rows: ReportRow[] = [];

    for (const [openingId, result] of Object.entries(results)) {
      const opening = dataset.opening(openingId);
      const shift = dataset.shift(opening.shiftId);

      rows.push({
        openingId,
        label: `${shift.title} · ${opening.roleName}`,
        status: result.status,
        reasons: result.reasons,
      });

      if (result.status === 'ELIGIBLE') summary.eligible += 1;
      else if (result.status === 'WAITLIST') summary.waitlist += 1;
      else summary.blocked += 1;
    }

    // An opportunity with no shifts scheduled yet is not worth a heading.
    if (rows.length > 0) {
      opportunities.push({
        opportunityId: opportunity.id,
        name: opportunity.name,
        city: opportunity.city,
        rows,
      });
    }
  }

  return { volunteerId, name: volunteer.name, audience, opportunities, summary };
}
