/**
 * Every field here is a decision SPEC.md did not make, or made twice.
 * The defaults are the resolutions argued in OBSERVATIONS.md.
 */
export interface PolicyConfig {
  /**
   * OBSERVATIONS.md §1.1 — the spec's flagship contradiction.
   * 'ANY': a volunteer fails when they hold ANY listed qualification (an exclusion
   *        list). Follows the Fern worked example and the evident safety intent.
   * 'ALL': a volunteer fails only when they hold EVERY listed qualification.
   *        Follows the literal rule table, which the worked example contradicts.
   */
  disallowedQualificationSemantics: 'ANY' | 'ALL';

  /** OBSERVATIONS.md §2.6 — accept a signature recording a version newer than current. */
  acceptNewerWaiverVersions: boolean;

  /** OBSERVATIONS.md §2.5 — a signup on a cancelled shift should not block anything. */
  ignoreConflictsOnInactiveShifts: boolean;

  /** OBSERVATIONS.md §2.4 — a waitlist place counts as already signed up. */
  waitlistedCountsAsSignedUp: boolean;
}

export const DEFAULT_POLICY: PolicyConfig = {
  disallowedQualificationSemantics: 'ANY',
  acceptNewerWaiverVersions: true,
  ignoreConflictsOnInactiveShifts: true,
  waitlistedCountsAsSignedUp: true,
};
