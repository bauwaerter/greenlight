import type { Dataset } from './dataset.js';
import type { PolicyConfig } from './policy.js';
import type { Audience, Opening, Opportunity, Shift, SignupState, Volunteer } from './types.js';

/** The opening under examination, with its shift and opportunity resolved. */
export interface Target {
  opening: Opening;
  shift: Shift;
  opportunity: Opportunity;
}

/**
 * Everything about a volunteer that does not change from one opening to the next.
 * Built once and reused across every opening by checkOpportunity.
 */
export interface VolunteerContext {
  volunteer: Volunteer;
  qualifications: Set<string>;
  groups: Set<string>;
  /** waiverId -> highest signed version. */
  waiverVersions: Map<string, number>;
  /** openingId -> the state of this volunteer's signup on it. */
  signupsByOpening: Map<string, SignupState>;
  /** Shifts this volunteer is confirmed for, for conflict detection. */
  confirmedShifts: { openingId: string; shift: Shift }[];
}

export interface EvalContext {
  dataset: Dataset;
  policy: PolicyConfig;
  volunteer: VolunteerContext;
  target: Target;
  audience: Audience;
}

export function resolveTarget(dataset: Dataset, openingId: string): Target {
  const opening = dataset.opening(openingId);
  const shift = dataset.shift(opening.shiftId);
  const opportunity = dataset.opportunity(shift.opportunityId);
  return { opening, shift, opportunity };
}

export function buildVolunteerContext(
  dataset: Dataset,
  volunteerId: string,
  policy: PolicyConfig,
): VolunteerContext {
  const volunteer = dataset.volunteer(volunteerId);

  const waiverVersions = new Map<string, number>();
  for (const signed of volunteer.signedWaivers) {
    const seen = waiverVersions.get(signed.waiverId);
    if (seen === undefined || signed.version > seen) {
      waiverVersions.set(signed.waiverId, signed.version);
    }
  }

  const signupsByOpening = new Map<string, SignupState>();
  const confirmedShifts: { openingId: string; shift: Shift }[] = [];

  for (const signup of dataset.signupsForVolunteer(volunteerId)) {
    signupsByOpening.set(signup.openingId, signup.state);
    if (signup.state !== 'CONFIRMED') continue; // SPEC.md rule 6: waitlisted blocks nothing.

    const shift = dataset.shift(dataset.opening(signup.openingId).shiftId);
    // OBSERVATIONS.md §2.5: a cancelled shift is not happening, so it cannot conflict.
    if (policy.ignoreConflictsOnInactiveShifts && (!shift.isActive || !shift.isPublished)) {
      continue;
    }
    confirmedShifts.push({ openingId: signup.openingId, shift });
  }

  return {
    volunteer,
    qualifications: new Set(volunteer.qualificationIds),
    groups: new Set(volunteer.groupIds),
    waiverVersions,
    signupsByOpening,
    confirmedShifts,
  };
}
