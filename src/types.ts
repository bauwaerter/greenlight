/** The eleven reason codes from the SPEC.md table. This union is the contract. */
export type ReasonCode =
  | 'ALREADY_SIGNED_UP'
  | 'AT_CAPACITY'
  | 'DISALLOWED_QUALIFICATION'
  | 'GROUP_RESTRICTED'
  | 'MISSING_QUALIFICATION'
  | 'OPENING_INACTIVE'
  | 'SCHEDULE_CONFLICT'
  | 'SHIFT_INACTIVE'
  | 'SHIFT_NOT_PUBLISHED'
  | 'WAITLIST_FULL'
  | 'WAIVER_REQUIRED';

export type EligibilityStatus = 'ELIGIBLE' | 'WAITLIST' | 'BLOCKED';

/**
 * Who the answer is being produced for.
 *
 * 'VOLUNTEER' is the contract SPEC.md specifies and the default everywhere: a
 * group-restricted opening comes back BLOCKED with no reasons, and no rule is even
 * consulted. 'STAFF' is for a coordinator who has to explain the refusal — the same
 * evaluation, with the withheld reason kept. See OBSERVATIONS.md §1.2.
 */
export type Audience = 'VOLUNTEER' | 'STAFF';

export interface EligibilityResult {
  status: EligibilityStatus;
  /** Deduplicated and sorted ascending. May be empty for BLOCKED — see OBSERVATIONS.md §1.2. */
  reasons: ReasonCode[];
}

export interface SignedWaiver {
  waiverId: string;
  version: number;
}

export interface Volunteer {
  id: string;
  name: string;
  qualificationIds: string[];
  signedWaivers: SignedWaiver[];
  groupIds: string[];
}

export type QualificationRuleType = 'HAS_ANY' | 'HAS_ALL' | 'DOES_NOT_HAVE_ALL';

export interface QualificationRule {
  id: string;
  type: QualificationRuleType;
  qualificationIds: string[];
  isActive: boolean;
}

export interface Opportunity {
  id: string;
  organizationId: string;
  name: string;
  /** Present in the fixtures but unused by any rule. See OBSERVATIONS.md §3.1 and §3.2. */
  city: string;
  requiredWaiverId: string | null;
  restrictedToGroupIds: string[];
  qualificationRules: QualificationRule[];
}

export interface Shift {
  id: string;
  opportunityId: string;
  title: string;
  /** Timezone-naive local ISO-8601, e.g. "2026-09-14T09:00:00". See OBSERVATIONS.md §3.1. */
  startsAt: string;
  endsAt: string;
  isPublished: boolean;
  isActive: boolean;
}

export interface Opening {
  id: string;
  shiftId: string;
  roleName: string;
  maxVolunteers: number;
  waitlistMax: number;
  isActive: boolean;
}

export type SignupState = 'CONFIRMED' | 'WAITLISTED';

export interface Signup {
  volunteerId: string;
  openingId: string;
  state: SignupState;
}

export interface Waiver {
  id: string;
  name: string;
  currentVersion: number;
}

export interface Qualification {
  id: string;
  name: string;
}

export interface Group {
  id: string;
  name: string;
}

export interface Organization {
  id: string;
  name: string;
}

export interface FixtureData {
  organizations: Organization[];
  qualifications: Qualification[];
  groups: Group[];
  waivers: Waiver[];
  volunteers: Volunteer[];
  opportunities: Opportunity[];
  shifts: Shift[];
  openings: Opening[];
  signups: Signup[];
}
