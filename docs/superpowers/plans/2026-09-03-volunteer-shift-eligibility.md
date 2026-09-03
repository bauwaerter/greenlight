# Volunteer Shift Eligibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `checkEligibility(volunteerId, openingId) -> { status, reasons }`, a single pure function that answers whether a volunteer may sign up for a shift opening and returns every reason they may not.

**Architecture:** A rule pipeline. Each rule in `SPEC.md` becomes one pure function `(ctx: EvalContext) => ReasonCode[]`. `checkEligibility` resolves the target opening once, builds a per-volunteer context once, runs every rule, unions the reason codes, then derives the status in a separate step. Group restriction is not a rule but a visibility gate that runs first and short-circuits. The disputed rule semantics identified in `OBSERVATIONS.md` live in a `PolicyConfig` object so each can be flipped in one line without touching rule logic. The bulk `checkOpportunity` API reuses one volunteer context across every opening, which is the whole reason the context is a separate object.

**Tech Stack:** TypeScript 5.6 (strict), Vitest 2, tsx for the CLI, Node 20+. No runtime dependencies.

**Spec:** `SPEC.md` (the requirements) and `OBSERVATIONS.md` (the contradictions and gaps found in it, and the resolution chosen for each). Read both. Where the two disagree, `OBSERVATIONS.md` records the deliberate decision and this plan implements it.

## Global Constraints

- Node `>=20`. `"type": "module"`. ESM only.
- TypeScript `strict: true`. No `any` in `src/`.
- **Zero runtime dependencies.** Everything in `devDependencies`.
- The eleven reason codes are exactly the strings in the `SPEC.md` reason code table. No additional codes may be invented, including for shifts in the past (`OBSERVATIONS.md` §2.9).
- The public entry point must expose the exact signature the spec names: `checkEligibility(volunteerId, openingId)`. The dataset and policy are bound by `createChecker()` rather than added as parameters.
- `reasons` is deduplicated and sorted ascending. Callers must not depend on order (`SPEC.md`: "Order doesn't matter"), but sorting makes test assertions stable.
- Every behaviour this plan chooses where `SPEC.md` is silent or self-contradictory carries a code comment citing the `OBSERVATIONS.md` section number.
- All 12 scenarios in `fixtures/cases.json` must pass unmodified. The fixture files are inputs and are never edited.

---

### Task 1: Project scaffold, domain types, and dataset indexing

Sets up the toolchain and the read layer everything else sits on. Indexing matters: the bulk API in Task 11 must not rescan the signup list per opening.

**Files:**
- Create: `package.json`, `tsconfig.json`, `.gitignore` (append)
- Create: `src/types.ts`
- Create: `src/dataset.ts`
- Create: `tests/helpers.ts`
- Test: `tests/dataset.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: all domain types; `buildDataset(data: FixtureData): Dataset`; `loadDataset(filePath: string): Dataset`; `class UnknownRecordError extends Error`. `Dataset` methods: `volunteer(id)`, `opening(id)`, `shift(id)`, `opportunity(id)`, `waiver(id)` — each returns the record or throws `UnknownRecordError`; `signupsForOpening(openingId): Signup[]`; `signupsForVolunteer(volunteerId): Signup[]`; `openingsForOpportunity(opportunityId): Opening[]`.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "volunteer-shift-eligibility",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=20" },
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit",
    "check": "tsx src/cli.ts"
  },
  "devDependencies": {
    "@types/node": "^22.7.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "strict": true,
    "resolveJsonModule": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["node"]
  },
  "include": ["src", "tests"]
}
```

- [ ] **Step 3: Install dependencies**

Run: `npm install`
Expected: `node_modules/` created, `package-lock.json` written, no errors. `node_modules/` is already ignored by `.gitignore`.

- [ ] **Step 4: Create `src/types.ts`**

```ts
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
```

- [ ] **Step 5: Create `tests/helpers.ts`**

```ts
import { fileURLToPath } from 'node:url';

export const FIXTURE_PATH = fileURLToPath(
  new URL('../fixtures/fixtures.json', import.meta.url),
);

export const CASES_PATH = fileURLToPath(
  new URL('../fixtures/cases.json', import.meta.url),
);
```

- [ ] **Step 6: Write the failing test**

Create `tests/dataset.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { loadDataset, UnknownRecordError } from '../src/dataset.js';
import { FIXTURE_PATH } from './helpers.js';

describe('dataset', () => {
  const dataset = loadDataset(FIXTURE_PATH);

  it('resolves records by id', () => {
    expect(dataset.volunteer('vol-001').name).toBe('Avery Chen');
    expect(dataset.opening('open-meals-tue-full').maxVolunteers).toBe(1);
    expect(dataset.shift('shift-meals-mon-am').isPublished).toBe(true);
    expect(dataset.opportunity('opp-warehouse').city).toBe('Denver');
    expect(dataset.waiver('waiver-general').currentVersion).toBe(2);
  });

  it('throws UnknownRecordError for an id that does not exist', () => {
    // OBSERVATIONS.md §2.7: a missing record is a data fault, not a BLOCKED result.
    expect(() => dataset.volunteer('vol-999')).toThrow(UnknownRecordError);
    expect(() => dataset.opening('open-nope')).toThrow(/Unknown opening: open-nope/);
  });

  it('indexes signups by opening and by volunteer', () => {
    const onTueServer = dataset.signupsForOpening('open-meals-tue-server');
    expect(onTueServer).toHaveLength(3);
    expect(onTueServer.filter((s) => s.state === 'CONFIRMED')).toHaveLength(2);

    const forVol002 = dataset.signupsForVolunteer('vol-002');
    expect(forVol002.map((s) => s.openingId).sort()).toEqual([
      'open-meals-mon-am-server',
      'open-meals-tue-server',
    ]);
  });

  it('returns an empty array for an id with no signups', () => {
    expect(dataset.signupsForVolunteer('vol-001')).toEqual([]);
    expect(dataset.signupsForOpening('open-youth-tue-mentor')).toEqual([]);
  });

  it('maps an opportunity to every opening beneath its shifts', () => {
    expect(dataset.openingsForOpportunity('opp-warehouse').map((o) => o.id).sort()).toEqual([
      'open-warehouse-mon-late-loader',
      'open-warehouse-mon-loader',
    ]);
  });
});
```

- [ ] **Step 7: Run the test to verify it fails**

Run: `npx vitest run tests/dataset.test.ts`
Expected: FAIL — cannot resolve `../src/dataset.js`.

- [ ] **Step 8: Create `src/dataset.ts`**

```ts
import { readFileSync } from 'node:fs';
import type {
  FixtureData,
  Opening,
  Opportunity,
  Shift,
  Signup,
  Volunteer,
  Waiver,
} from './types.js';

export class UnknownRecordError extends Error {
  constructor(
    readonly kind: string,
    readonly id: string,
  ) {
    super(`Unknown ${kind}: ${id}`);
    this.name = 'UnknownRecordError';
  }
}

export interface Dataset {
  volunteer(id: string): Volunteer;
  opening(id: string): Opening;
  shift(id: string): Shift;
  opportunity(id: string): Opportunity;
  waiver(id: string): Waiver;
  signupsForOpening(openingId: string): Signup[];
  signupsForVolunteer(volunteerId: string): Signup[];
  openingsForOpportunity(opportunityId: string): Opening[];
  readonly raw: FixtureData;
}

function indexById<T extends { id: string }>(records: T[]): Map<string, T> {
  return new Map(records.map((record) => [record.id, record]));
}

function groupBy<T>(records: T[], key: (record: T) => string): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const record of records) {
    const bucket = grouped.get(key(record));
    if (bucket) {
      bucket.push(record);
    } else {
      grouped.set(key(record), [record]);
    }
  }
  return grouped;
}

export function buildDataset(data: FixtureData): Dataset {
  const volunteers = indexById(data.volunteers);
  const openings = indexById(data.openings);
  const shifts = indexById(data.shifts);
  const opportunities = indexById(data.opportunities);
  const waivers = indexById(data.waivers);

  const signupsByOpening = groupBy(data.signups, (signup) => signup.openingId);
  const signupsByVolunteer = groupBy(data.signups, (signup) => signup.volunteerId);

  // Openings hang off shifts, and shifts off opportunities. Precomputed so the bulk
  // API in checkOpportunity does not walk the whole opening list per call.
  const openingsByOpportunity = groupBy(data.openings, (opening) => {
    const shift = shifts.get(opening.shiftId);
    if (!shift) throw new UnknownRecordError('shift', opening.shiftId);
    return shift.opportunityId;
  });

  function require<T>(index: Map<string, T>, kind: string, id: string): T {
    const record = index.get(id);
    if (!record) throw new UnknownRecordError(kind, id);
    return record;
  }

  return {
    raw: data,
    volunteer: (id) => require(volunteers, 'volunteer', id),
    opening: (id) => require(openings, 'opening', id),
    shift: (id) => require(shifts, 'shift', id),
    opportunity: (id) => require(opportunities, 'opportunity', id),
    waiver: (id) => require(waivers, 'waiver', id),
    signupsForOpening: (openingId) => signupsByOpening.get(openingId) ?? [],
    signupsForVolunteer: (volunteerId) => signupsByVolunteer.get(volunteerId) ?? [],
    openingsForOpportunity: (opportunityId) => openingsByOpportunity.get(opportunityId) ?? [],
  };
}

export function loadDataset(filePath: string): Dataset {
  return buildDataset(JSON.parse(readFileSync(filePath, 'utf8')) as FixtureData);
}
```

- [ ] **Step 9: Run the test to verify it passes**

Run: `npx vitest run tests/dataset.test.ts && npx tsc --noEmit`
Expected: 5 tests PASS, no type errors.

- [ ] **Step 10: Commit**

```bash
git add package.json package-lock.json tsconfig.json src/types.ts src/dataset.ts tests/dataset.test.ts tests/helpers.ts
git commit -m "feat: project scaffold, domain types, and indexed dataset"
```

---

### Task 2: Policy configuration and evaluation context

The context is built once per volunteer and reused across every opening. That is what makes the bulk API cheap, and it is also where the "ignore cancelled shifts when detecting conflicts" decision lives.

**Files:**
- Create: `src/policy.ts`
- Create: `src/context.ts`
- Test: `tests/context.test.ts`

**Interfaces:**
- Consumes: `Dataset` and all types from Task 1.
- Produces: `interface PolicyConfig`; `const DEFAULT_POLICY: PolicyConfig`; `interface Target { opening; shift; opportunity }`; `interface VolunteerContext`; `interface EvalContext { dataset; policy; volunteer; target }`; `resolveTarget(dataset, openingId): Target`; `buildVolunteerContext(dataset, volunteerId, policy): VolunteerContext`.

- [ ] **Step 1: Create `src/policy.ts`**

```ts
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
```

- [ ] **Step 2: Write the failing test**

Create `tests/context.test.ts`:

```ts
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
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run tests/context.test.ts`
Expected: FAIL — cannot resolve `../src/context.js`.

- [ ] **Step 4: Create `src/context.ts`**

```ts
import type { Dataset } from './dataset.js';
import type { PolicyConfig } from './policy.js';
import type { Opening, Opportunity, Shift, SignupState, Volunteer } from './types.js';

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
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/context.test.ts && npx tsc --noEmit`
Expected: 6 tests PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/policy.ts src/context.ts tests/context.test.ts
git commit -m "feat: policy configuration and per-volunteer evaluation context"
```

---

### Task 3: Shift and opening status rule

`SPEC.md` rule 1. The simplest rule, and the one that establishes the shape every other rule follows.

**Files:**
- Create: `src/rules/status.ts`
- Test: `tests/rules/status.test.ts`

**Interfaces:**
- Consumes: `EvalContext` from Task 2.
- Produces: `statusRule(ctx: EvalContext): ReasonCode[]`.

- [ ] **Step 1: Write the failing test**

Create `tests/rules/status.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildVolunteerContext, resolveTarget } from '../../src/context.js';
import type { EvalContext } from '../../src/context.js';
import { loadDataset } from '../../src/dataset.js';
import { DEFAULT_POLICY } from '../../src/policy.js';
import { statusRule } from '../../src/rules/status.js';
import { FIXTURE_PATH } from '../helpers.js';

const dataset = loadDataset(FIXTURE_PATH);

function contextFor(volunteerId: string, openingId: string): EvalContext {
  return {
    dataset,
    policy: DEFAULT_POLICY,
    volunteer: buildVolunteerContext(dataset, volunteerId, DEFAULT_POLICY),
    target: resolveTarget(dataset, openingId),
  };
}

describe('statusRule', () => {
  it('returns nothing for a published, active shift with an active opening', () => {
    expect(statusRule(contextFor('vol-001', 'open-meals-mon-pm-server'))).toEqual([]);
  });

  it('flags an unpublished shift', () => {
    expect(statusRule(contextFor('vol-001', 'open-meals-draft-server'))).toEqual([
      'SHIFT_NOT_PUBLISHED',
    ]);
  });

  it('flags a cancelled shift', () => {
    expect(statusRule(contextFor('vol-001', 'open-meals-cancelled-server'))).toEqual([
      'SHIFT_INACTIVE',
    ]);
  });

  it('flags a retired opening', () => {
    expect(statusRule(contextFor('vol-002', 'open-meals-tue-retired'))).toEqual([
      'OPENING_INACTIVE',
    ]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/rules/status.test.ts`
Expected: FAIL — cannot resolve `../../src/rules/status.js`.

- [ ] **Step 3: Create `src/rules/status.ts`**

```ts
import type { EvalContext } from '../context.js';
import type { ReasonCode } from '../types.js';

/**
 * SPEC.md rule 1. All three conditions are reported independently — a shift can be
 * both unpublished and cancelled, and the volunteer is told about both.
 */
export function statusRule(ctx: EvalContext): ReasonCode[] {
  const reasons: ReasonCode[] = [];
  const { shift, opening } = ctx.target;

  if (!shift.isPublished) reasons.push('SHIFT_NOT_PUBLISHED');
  if (!shift.isActive) reasons.push('SHIFT_INACTIVE');
  if (!opening.isActive) reasons.push('OPENING_INACTIVE');

  return reasons;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/rules/status.test.ts`
Expected: 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/rules/status.ts tests/rules/status.test.ts
git commit -m "feat: shift and opening status rule"
```

---

### Task 4: Capacity and existing-signup rule

`SPEC.md` rule 2. Capacity is two things at once: a source of blocking reasons, and the input to the `WAITLIST` status. Splitting `assessCapacity` out from the rule keeps that clean — the rule reports blocking reasons, and Task 10's status derivation asks `assessCapacity` whether a waitlist place exists.

**Files:**
- Create: `src/rules/capacity.ts`
- Test: `tests/rules/capacity.test.ts`

**Interfaces:**
- Consumes: `EvalContext` from Task 2.
- Produces: `type CapacityOutcome = 'OPEN' | 'WAITLIST' | 'FULL'`; `interface CapacityAssessment { outcome: CapacityOutcome; confirmed: number; waitlisted: number }`; `assessCapacity(ctx: EvalContext): CapacityAssessment`; `capacityRule(ctx: EvalContext): ReasonCode[]`.

- [ ] **Step 1: Write the failing test**

Create `tests/rules/capacity.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildVolunteerContext, resolveTarget } from '../../src/context.js';
import type { EvalContext } from '../../src/context.js';
import { buildDataset, loadDataset } from '../../src/dataset.js';
import { DEFAULT_POLICY } from '../../src/policy.js';
import type { PolicyConfig } from '../../src/policy.js';
import { assessCapacity, capacityRule } from '../../src/rules/capacity.js';
import type { Dataset } from '../../src/dataset.js';
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/rules/capacity.test.ts`
Expected: FAIL — cannot resolve `../../src/rules/capacity.js`.

- [ ] **Step 3: Create `src/rules/capacity.ts`**

```ts
import type { EvalContext } from '../context.js';
import type { ReasonCode } from '../types.js';

export type CapacityOutcome = 'OPEN' | 'WAITLIST' | 'FULL';

export interface CapacityAssessment {
  outcome: CapacityOutcome;
  confirmed: number;
  waitlisted: number;
}

/**
 * SPEC.md rule 2. Separated from capacityRule because the WAITLIST *status* needs
 * this answer even when the rule itself reports no blocking reason.
 */
export function assessCapacity(ctx: EvalContext): CapacityAssessment {
  const { maxVolunteers, waitlistMax } = ctx.target.opening;
  const signups = ctx.dataset.signupsForOpening(ctx.target.opening.id);

  let confirmed = 0;
  let waitlisted = 0;
  for (const signup of signups) {
    if (signup.state === 'CONFIRMED') confirmed += 1;
    else waitlisted += 1;
  }

  if (confirmed < maxVolunteers) return { outcome: 'OPEN', confirmed, waitlisted };
  if (waitlisted < waitlistMax) return { outcome: 'WAITLIST', confirmed, waitlisted };
  return { outcome: 'FULL', confirmed, waitlisted };
}

export function capacityRule(ctx: EvalContext): ReasonCode[] {
  const existing = ctx.volunteer.signupsByOpening.get(ctx.target.opening.id);
  if (existing !== undefined) {
    // OBSERVATIONS.md §2.4: whether a waitlist place counts is a policy decision.
    if (existing === 'CONFIRMED' || ctx.policy.waitlistedCountsAsSignedUp) {
      return ['ALREADY_SIGNED_UP'];
    }
  }

  if (assessCapacity(ctx).outcome !== 'FULL') return [];

  // SPEC.md distinguishes "no waitlist offered" from "waitlist exists but is full".
  return ctx.target.opening.waitlistMax === 0 ? ['AT_CAPACITY'] : ['WAITLIST_FULL'];
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/rules/capacity.test.ts && npx tsc --noEmit`
Expected: 12 tests PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/rules/capacity.ts tests/rules/capacity.test.ts
git commit -m "feat: capacity and existing-signup rule"
```

---

### Task 5: Qualification rules

`SPEC.md` rule 3, and the site of the spec's flagship contradiction (`OBSERVATIONS.md` §1.1). Rules combine with AND; inactive rules are skipped; a failure of any rule yields one code, deduplicated.

**Files:**
- Create: `src/rules/qualifications.ts`
- Test: `tests/rules/qualifications.test.ts`

**Interfaces:**
- Consumes: `EvalContext` from Task 2, `PolicyConfig` from Task 2.
- Produces: `qualificationRule(ctx: EvalContext): ReasonCode[]`.

- [ ] **Step 1: Write the failing test**

Create `tests/rules/qualifications.test.ts`:

```ts
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
    const opportunity = data.opportunities.find((candidate) => candidate.id === 'opp-warehouse');
    if (!opportunity) throw new Error('fixture changed: opp-warehouse missing');
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/rules/qualifications.test.ts`
Expected: FAIL — cannot resolve `../../src/rules/qualifications.js`.

- [ ] **Step 3: Create `src/rules/qualifications.ts`**

```ts
import type { EvalContext } from '../context.js';
import type { QualificationRule, ReasonCode } from '../types.js';
import type { PolicyConfig } from '../policy.js';

/**
 * True when the volunteer FAILS the rule.
 *
 * An empty qualificationIds list never fails. OBSERVATIONS.md §3.3: an empty list is
 * far more likely to be a half-configured rule than an intent to block every
 * volunteer, and blocking everyone is the more damaging way to be wrong.
 */
function fails(rule: QualificationRule, held: Set<string>, policy: PolicyConfig): boolean {
  const ids = rule.qualificationIds;
  if (ids.length === 0) return false;

  switch (rule.type) {
    case 'HAS_ANY':
      return !ids.some((id) => held.has(id));
    case 'HAS_ALL':
      return !ids.every((id) => held.has(id));
    case 'DOES_NOT_HAVE_ALL':
      // OBSERVATIONS.md §1.1 — SPEC.md's rule table and its worked example disagree.
      // 'ANY' reads the rule as an exclusion list, matching the Fern example.
      // 'ALL' reads it literally, matching the table.
      return policy.disallowedQualificationSemantics === 'ANY'
        ? ids.some((id) => held.has(id))
        : ids.every((id) => held.has(id));
  }
}

/**
 * SPEC.md rule 3. Active rules combine with AND — the volunteer must pass all of them.
 * Codes are collected into a Set so several failing rules of the same kind produce one
 * reason, not a repeated one (OBSERVATIONS.md §2.8).
 */
export function qualificationRule(ctx: EvalContext): ReasonCode[] {
  const reasons = new Set<ReasonCode>();
  const held = ctx.volunteer.qualifications;

  for (const rule of ctx.target.opportunity.qualificationRules) {
    if (!rule.isActive) continue;
    if (!fails(rule, held, ctx.policy)) continue;

    reasons.add(
      rule.type === 'DOES_NOT_HAVE_ALL' ? 'DISALLOWED_QUALIFICATION' : 'MISSING_QUALIFICATION',
    );
  }

  return [...reasons];
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/rules/qualifications.test.ts && npx tsc --noEmit`
Expected: 13 tests PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/rules/qualifications.ts tests/rules/qualifications.test.ts
git commit -m "feat: qualification rules with configurable exclusion semantics"
```

---

### Task 6: Waiver rule

`SPEC.md` rule 4. A signature against an older version does not count.

**Files:**
- Create: `src/rules/waiver.ts`
- Test: `tests/rules/waiver.test.ts`

**Interfaces:**
- Consumes: `EvalContext` from Task 2.
- Produces: `waiverRule(ctx: EvalContext): ReasonCode[]`.

- [ ] **Step 1: Write the failing test**

Create `tests/rules/waiver.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/rules/waiver.test.ts`
Expected: FAIL — cannot resolve `../../src/rules/waiver.js`.

- [ ] **Step 3: Create `src/rules/waiver.ts`**

```ts
import type { EvalContext } from '../context.js';
import type { ReasonCode } from '../types.js';

/**
 * SPEC.md rule 4. The signature must be against the waiver's current version — an
 * older one does not count because the text changed.
 */
export function waiverRule(ctx: EvalContext): ReasonCode[] {
  const requiredWaiverId = ctx.target.opportunity.requiredWaiverId;
  if (requiredWaiverId === null) return [];

  const waiver = ctx.dataset.waiver(requiredWaiverId);
  const signedVersion = ctx.volunteer.waiverVersions.get(requiredWaiverId);
  if (signedVersion === undefined) return ['WAIVER_REQUIRED'];

  // OBSERVATIONS.md §2.6: a signature recording a version newer than current happens
  // when a revision is rolled back. Blocking that volunteer would be self-inflicted.
  const acceptable = ctx.policy.acceptNewerWaiverVersions
    ? signedVersion >= waiver.currentVersion
    : signedVersion === waiver.currentVersion;

  return acceptable ? [] : ['WAIVER_REQUIRED'];
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/rules/waiver.test.ts && npx tsc --noEmit`
Expected: 7 tests PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/rules/waiver.ts tests/rules/waiver.test.ts
git commit -m "feat: waiver rule with current-version check"
```

---

### Task 7: Group restriction visibility gate

`SPEC.md` rule 5. This is deliberately **not** shaped like the other rules. It returns a boolean, not reason codes, because it does not contribute a reason — it suppresses the entire result. See `OBSERVATIONS.md` §1.2 for why.

**Files:**
- Create: `src/rules/groups.ts`
- Test: `tests/rules/groups.test.ts`

**Interfaces:**
- Consumes: `EvalContext` from Task 2.
- Produces: `isGroupRestricted(ctx: EvalContext): boolean` — true when the volunteer must not see this opening.

- [ ] **Step 1: Write the failing test**

Create `tests/rules/groups.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildVolunteerContext, resolveTarget } from '../../src/context.js';
import type { EvalContext } from '../../src/context.js';
import { buildDataset, loadDataset } from '../../src/dataset.js';
import type { Dataset } from '../../src/dataset.js';
import { DEFAULT_POLICY } from '../../src/policy.js';
import { isGroupRestricted } from '../../src/rules/groups.js';
import { FIXTURE_PATH } from '../helpers.js';

const dataset = loadDataset(FIXTURE_PATH);

function contextFor(volunteerId: string, openingId: string, data: Dataset = dataset): EvalContext {
  return {
    dataset: data,
    policy: DEFAULT_POLICY,
    volunteer: buildVolunteerContext(data, volunteerId, DEFAULT_POLICY),
    target: resolveTarget(data, openingId),
  };
}

describe('isGroupRestricted', () => {
  it('is false when the opportunity restricts nothing', () => {
    expect(isGroupRestricted(contextFor('vol-003', 'open-meals-mon-pm-server'))).toBe(false);
  });

  it('is false for a member of a listed group', () => {
    // opp-kitchen is restricted to group-acme; vol-001 is a member.
    expect(isGroupRestricted(contextFor('vol-001', 'open-kitchen-sat-cleaner'))).toBe(false);
  });

  it('is true for a volunteer in no listed group', () => {
    // vol-002 belongs to no groups at all.
    expect(isGroupRestricted(contextFor('vol-002', 'open-kitchen-sat-cleaner'))).toBe(true);
  });

  it('is true for a volunteer in a different group', () => {
    // vol-005 is in group-youth, not group-acme.
    expect(isGroupRestricted(contextFor('vol-005', 'open-kitchen-sat-cleaner'))).toBe(true);
  });

  it('is false when the volunteer matches any one of several listed groups', () => {
    const data = structuredClone(dataset.raw);
    const opportunity = data.opportunities.find((candidate) => candidate.id === 'opp-kitchen');
    if (!opportunity) throw new Error('fixture changed: opp-kitchen missing');
    opportunity.restrictedToGroupIds = ['group-acme', 'group-youth'];

    expect(isGroupRestricted(contextFor('vol-005', 'open-kitchen-sat-cleaner', buildDataset(data)))).toBe(
      false,
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/rules/groups.test.ts`
Expected: FAIL — cannot resolve `../../src/rules/groups.js`.

- [ ] **Step 3: Create `src/rules/groups.ts`**

```ts
import type { EvalContext } from '../context.js';

/**
 * SPEC.md rule 5, and OBSERVATIONS.md §1.2.
 *
 * This is a visibility gate, not a rule. It returns a boolean rather than a reason
 * code because rule 5 requires BLOCKED with an EMPTY reasons list — group membership
 * is confidential and must not be disclosed. GROUP_RESTRICTED therefore appears in
 * the SPEC.md reason table but is never emitted.
 *
 * It must short-circuit the whole evaluation. If it did not, a restricted volunteer
 * would see the other reasons, fix them, and still be blocked with no explanation —
 * exactly the outcome SPEC.md calls "the worst possible outcome for us".
 *
 * The real fix is upstream: these openings should be filtered out of browse entirely
 * so the question is never asked. See OBSERVATIONS.md §1.2.
 */
export function isGroupRestricted(ctx: EvalContext): boolean {
  const restrictedTo = ctx.target.opportunity.restrictedToGroupIds;
  if (restrictedTo.length === 0) return false;
  return !restrictedTo.some((groupId) => ctx.volunteer.groups.has(groupId));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/rules/groups.test.ts`
Expected: 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/rules/groups.ts tests/rules/groups.test.ts
git commit -m "feat: group restriction visibility gate"
```

---

### Task 8: Schedule conflict rule

`SPEC.md` rule 6. Two traps here: shifts that merely touch must not conflict, and a shift must not conflict with itself.

**Files:**
- Create: `src/intervals.ts`
- Create: `src/rules/schedule.ts`
- Test: `tests/intervals.test.ts`
- Test: `tests/rules/schedule.test.ts`

**Interfaces:**
- Consumes: `EvalContext` from Task 2, `Shift` from Task 1.
- Produces: `interface Interval { start: number; end: number }`; `toInterval(shift: Shift): Interval`; `overlaps(a: Interval, b: Interval): boolean`; `scheduleRule(ctx: EvalContext): ReasonCode[]`.

- [ ] **Step 1: Write the failing interval test**

Create `tests/intervals.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { overlaps, toInterval } from '../src/intervals.js';
import type { Shift } from '../src/types.js';

function shift(startsAt: string, endsAt: string): Shift {
  return {
    id: 's',
    opportunityId: 'o',
    title: 't',
    startsAt,
    endsAt,
    isPublished: true,
    isActive: true,
  };
}

describe('overlaps', () => {
  it('is true for shifts that genuinely overlap', () => {
    const a = toInterval(shift('2026-09-14T11:00:00', '2026-09-14T15:00:00'));
    const b = toInterval(shift('2026-09-14T14:00:00', '2026-09-14T18:00:00'));
    expect(overlaps(a, b)).toBe(true);
    expect(overlaps(b, a)).toBe(true);
  });

  it('is false for shifts that merely touch', () => {
    // OBSERVATIONS.md §2.3. The fixtures contain this pair deliberately:
    // Monday Lunch Prep ends 12:00 and Monday Lunch Service starts 12:00.
    const a = toInterval(shift('2026-09-14T09:00:00', '2026-09-14T12:00:00'));
    const b = toInterval(shift('2026-09-14T12:00:00', '2026-09-14T15:00:00'));
    expect(overlaps(a, b)).toBe(false);
    expect(overlaps(b, a)).toBe(false);
  });

  it('is false for shifts on different days', () => {
    const a = toInterval(shift('2026-09-14T11:00:00', '2026-09-14T15:00:00'));
    const b = toInterval(shift('2026-09-15T11:00:00', '2026-09-15T14:00:00'));
    expect(overlaps(a, b)).toBe(false);
  });

  it('is true when one shift wholly contains another', () => {
    const a = toInterval(shift('2026-09-14T09:00:00', '2026-09-14T18:00:00'));
    const b = toInterval(shift('2026-09-14T11:00:00', '2026-09-14T12:00:00'));
    expect(overlaps(a, b)).toBe(true);
    expect(overlaps(b, a)).toBe(true);
  });

  it('is true for an identical pair', () => {
    const a = toInterval(shift('2026-09-14T09:00:00', '2026-09-14T12:00:00'));
    expect(overlaps(a, a)).toBe(true);
  });

  it('throws on an unparseable timestamp', () => {
    expect(() => toInterval(shift('not-a-date', '2026-09-14T12:00:00'))).toThrow(/not-a-date/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/intervals.test.ts`
Expected: FAIL — cannot resolve `../src/intervals.js`.

- [ ] **Step 3: Create `src/intervals.ts`**

```ts
import type { Shift } from './types.js';

export interface Interval {
  start: number;
  end: number;
}

/**
 * Shift timestamps carry no offset (OBSERVATIONS.md §3.1). Date.parse reads them as
 * local time, which is consistent across every shift, so comparisons between them are
 * sound *as long as every shift is in one timezone*. The fixtures span Indianapolis
 * and Denver, so they are not. This is a known and documented limitation: fixing it
 * needs a timezone on the organization or offsets in the data, not a change here.
 */
export function toInterval(shift: Shift): Interval {
  const start = Date.parse(shift.startsAt);
  const end = Date.parse(shift.endsAt);
  if (Number.isNaN(start)) throw new Error(`Unparseable startsAt on ${shift.id}: ${shift.startsAt}`);
  if (Number.isNaN(end)) throw new Error(`Unparseable endsAt on ${shift.id}: ${shift.endsAt}`);
  return { start, end };
}

/**
 * Half-open intervals: shifts that merely touch do not overlap. Working a morning
 * block that ends at 12:00 and an afternoon block that starts at 12:00 is the most
 * common real pattern in the data, and treating it as a conflict would be wrong.
 */
export function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end;
}
```

- [ ] **Step 4: Run the interval test to verify it passes**

Run: `npx vitest run tests/intervals.test.ts`
Expected: 6 tests PASS.

- [ ] **Step 5: Write the failing schedule test**

Create `tests/rules/schedule.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildVolunteerContext, resolveTarget } from '../../src/context.js';
import type { EvalContext } from '../../src/context.js';
import { buildDataset, loadDataset } from '../../src/dataset.js';
import type { Dataset } from '../../src/dataset.js';
import { DEFAULT_POLICY } from '../../src/policy.js';
import { scheduleRule } from '../../src/rules/schedule.js';
import { FIXTURE_PATH } from '../helpers.js';

const dataset = loadDataset(FIXTURE_PATH);

function contextFor(volunteerId: string, openingId: string, data: Dataset = dataset): EvalContext {
  return {
    dataset: data,
    policy: DEFAULT_POLICY,
    volunteer: buildVolunteerContext(data, volunteerId, DEFAULT_POLICY),
    target: resolveTarget(data, openingId),
  };
}

describe('scheduleRule', () => {
  it('flags an overlap with a confirmed shift', () => {
    // vol-004 is confirmed on Monday Evening Load (14:00-18:00). Monday Sort is
    // 11:00-15:00, so they overlap.
    expect(scheduleRule(contextFor('vol-004', 'open-warehouse-mon-loader'))).toEqual([
      'SCHEDULE_CONFLICT',
    ]);
  });

  it('ignores a waitlisted signup', () => {
    // SPEC.md rule 6: only confirmed signups count. vol-003 is WAITLISTED on
    // open-meals-tue-server (Tue 11:00-14:00). Build a genuinely different shift that
    // overlaps it — checking against another opening on the SAME shift would pass for
    // the wrong reason, because the self-conflict guard would skip it anyway.
    const data = structuredClone(dataset.raw);
    data.shifts.push({
      id: 'shift-meals-tue-overlap',
      opportunityId: 'opp-meals',
      title: 'Tuesday Afternoon Service',
      startsAt: '2026-09-15T12:00:00',
      endsAt: '2026-09-15T16:00:00',
      isPublished: true,
      isActive: true,
    });
    data.openings.push({
      id: 'open-meals-tue-overlap-server',
      shiftId: 'shift-meals-tue-overlap',
      roleName: 'Server',
      maxVolunteers: 4,
      waitlistMax: 0,
      isActive: true,
    });

    expect(
      scheduleRule(contextFor('vol-003', 'open-meals-tue-overlap-server', buildDataset(data))),
    ).toEqual([]);

    // Same data, same windows, but confirmed instead of waitlisted: now it conflicts.
    // Without this half the test above would pass even if the rule ignored everything.
    const confirmed = structuredClone(data);
    const signup = confirmed.signups.find(
      (candidate) =>
        candidate.volunteerId === 'vol-003' && candidate.openingId === 'open-meals-tue-server',
    );
    if (!signup) throw new Error('fixture changed: vol-003 waitlist signup missing');
    signup.state = 'CONFIRMED';

    expect(
      scheduleRule(contextFor('vol-003', 'open-meals-tue-overlap-server', buildDataset(confirmed))),
    ).toEqual(['SCHEDULE_CONFLICT']);
  });

  it('does not flag a shift as conflicting with itself', () => {
    // OBSERVATIONS.md §2.2. vol-002 is confirmed on open-meals-mon-am-server, which
    // trivially overlaps its own shift. Only ALREADY_SIGNED_UP should apply.
    expect(scheduleRule(contextFor('vol-002', 'open-meals-mon-am-server'))).toEqual([]);
  });

  it('does not flag a different opening on the same shift', () => {
    // A volunteer confirmed as Prep Cook checking a second role on the SAME shift is
    // not holding "two shifts that overlap" (SPEC.md rule 6 is about shifts). Worth
    // raising with the PM — see OBSERVATIONS.md §2.2.
    const data = structuredClone(dataset.raw);
    data.openings.push({
      id: 'open-meals-mon-am-second-role',
      shiftId: 'shift-meals-mon-am',
      roleName: 'Greeter',
      maxVolunteers: 2,
      waitlistMax: 0,
      isActive: true,
    });
    expect(
      scheduleRule(contextFor('vol-002', 'open-meals-mon-am-second-role', buildDataset(data))),
    ).toEqual([]);
  });

  it('does not flag shifts that merely touch', () => {
    // vol-002 is confirmed on Monday Lunch Prep (09:00-12:00). Monday Lunch Service
    // starts exactly at 12:00.
    expect(scheduleRule(contextFor('vol-002', 'open-meals-mon-pm-server'))).toEqual([]);
  });

  it('returns nothing for a volunteer with no confirmed signups', () => {
    expect(scheduleRule(contextFor('vol-001', 'open-warehouse-mon-loader'))).toEqual([]);
  });

  it('ignores a confirmed signup on a cancelled shift', () => {
    // OBSERVATIONS.md §2.5. The cancelled Thursday shift is 11:00-14:00; give it an
    // overlapping live counterpart to check against.
    const data = structuredClone(dataset.raw);
    data.signups.push({
      volunteerId: 'vol-001',
      openingId: 'open-meals-cancelled-server',
      state: 'CONFIRMED',
    });
    data.shifts.push({
      id: 'shift-meals-thu-live',
      opportunityId: 'opp-meals',
      title: 'Thursday Replacement Service',
      startsAt: '2026-09-17T11:00:00',
      endsAt: '2026-09-17T14:00:00',
      isPublished: true,
      isActive: true,
    });
    data.openings.push({
      id: 'open-meals-thu-live-server',
      shiftId: 'shift-meals-thu-live',
      roleName: 'Server',
      maxVolunteers: 4,
      waitlistMax: 0,
      isActive: true,
    });

    expect(
      scheduleRule(contextFor('vol-001', 'open-meals-thu-live-server', buildDataset(data))),
    ).toEqual([]);
  });
});
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `npx vitest run tests/rules/schedule.test.ts`
Expected: FAIL — cannot resolve `../../src/rules/schedule.js`.

- [ ] **Step 7: Create `src/rules/schedule.ts`**

```ts
import type { EvalContext } from '../context.js';
import { overlaps, toInterval } from '../intervals.js';
import type { ReasonCode } from '../types.js';

/**
 * SPEC.md rule 6. Only confirmed signups block, which the context already enforces.
 *
 * A shift never conflicts with itself (OBSERVATIONS.md §2.2). Without this guard, a
 * volunteer already confirmed on this opening would get a spurious SCHEDULE_CONFLICT
 * alongside ALREADY_SIGNED_UP, because they are confirmed on a shift that overlaps
 * the one being checked — namely this one.
 */
export function scheduleRule(ctx: EvalContext): ReasonCode[] {
  const target = toInterval(ctx.target.shift);

  for (const committed of ctx.volunteer.confirmedShifts) {
    if (committed.shift.id === ctx.target.shift.id) continue;
    if (overlaps(target, toInterval(committed.shift))) return ['SCHEDULE_CONFLICT'];
  }

  return [];
}
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `npx vitest run tests/intervals.test.ts tests/rules/schedule.test.ts && npx tsc --noEmit`
Expected: 13 tests PASS, no type errors.

- [ ] **Step 9: Commit**

```bash
git add src/intervals.ts src/rules/schedule.ts tests/intervals.test.ts tests/rules/schedule.test.ts
git commit -m "feat: schedule conflict rule with half-open interval overlap"
```

---

### Task 9: Assemble checkEligibility and pass the supplied cases

Wires the rules together, derives the status, and runs `fixtures/cases.json` as a table. This is the first task that produces the deliverable the spec asks for.

**Files:**
- Create: `src/rules/index.ts`
- Create: `src/eligibility.ts`
- Create: `src/index.ts`
- Test: `tests/cases.test.ts`

**Interfaces:**
- Consumes: every rule from Tasks 3–8, `EvalContext`/`resolveTarget`/`buildVolunteerContext` from Task 2, `Dataset` from Task 1.
- Produces: `const RULES: ((ctx: EvalContext) => ReasonCode[])[]`; `evaluate(ctx: EvalContext): EligibilityResult`; `interface EligibilityChecker { checkEligibility(volunteerId, openingId): EligibilityResult; checkOpportunity(volunteerId, opportunityId): Record<string, EligibilityResult> }`; `createChecker(dataset: Dataset, policy?: PolicyConfig): EligibilityChecker`. `checkOpportunity` is stubbed here and implemented in Task 11.

- [ ] **Step 1: Create `src/rules/index.ts`**

```ts
import type { EvalContext } from '../context.js';
import type { ReasonCode } from '../types.js';
import { capacityRule } from './capacity.js';
import { qualificationRule } from './qualifications.js';
import { scheduleRule } from './schedule.js';
import { statusRule } from './status.js';
import { waiverRule } from './waiver.js';

export type Rule = (ctx: EvalContext) => ReasonCode[];

/**
 * Every rule runs. SPEC.md: "Return every reason that applies, not just the first
 * one." Adding a rule to this array is the whole cost of adding a rule.
 *
 * The group gate is deliberately absent — it is not a rule. See rules/groups.ts.
 */
export const RULES: Rule[] = [
  statusRule,
  capacityRule,
  qualificationRule,
  waiverRule,
  scheduleRule,
];

export { assessCapacity } from './capacity.js';
export { isGroupRestricted } from './groups.js';
```

- [ ] **Step 2: Write the failing test**

Create `tests/cases.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadDataset } from '../src/dataset.js';
import { createChecker } from '../src/eligibility.js';
import type { EligibilityResult } from '../src/types.js';
import { CASES_PATH, FIXTURE_PATH } from './helpers.js';

interface Case {
  name: string;
  volunteerId: string;
  openingId: string;
  expected: EligibilityResult;
}

const cases = JSON.parse(readFileSync(CASES_PATH, 'utf8')) as Case[];
const checker = createChecker(loadDataset(FIXTURE_PATH));

describe('fixtures/cases.json', () => {
  it('supplies the twelve scenarios the exercise ships with', () => {
    expect(cases).toHaveLength(12);
  });

  it.each(cases)('$name', ({ volunteerId, openingId, expected }) => {
    const result = checker.checkEligibility(volunteerId, openingId);
    expect(result.status).toBe(expected.status);
    expect([...result.reasons].sort()).toEqual([...expected.reasons].sort());
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run tests/cases.test.ts`
Expected: FAIL — cannot resolve `../src/eligibility.js`.

- [ ] **Step 4: Create `src/eligibility.ts`**

```ts
import { buildVolunteerContext, resolveTarget } from './context.js';
import type { EvalContext, VolunteerContext } from './context.js';
import type { Dataset } from './dataset.js';
import { DEFAULT_POLICY } from './policy.js';
import type { PolicyConfig } from './policy.js';
import { assessCapacity, isGroupRestricted, RULES } from './rules/index.js';
import type { EligibilityResult, ReasonCode } from './types.js';

export function evaluate(ctx: EvalContext): EligibilityResult {
  // SPEC.md rule 5 / OBSERVATIONS.md §1.2: this must short-circuit. Returning the
  // other reasons alongside an unexplained block would let a volunteer fix everything
  // they were told about and still be refused.
  if (isGroupRestricted(ctx)) return { status: 'BLOCKED', reasons: [] };

  const reasons = new Set<ReasonCode>();
  for (const rule of RULES) {
    for (const reason of rule(ctx)) reasons.add(reason);
  }

  // OBSERVATIONS.md §2.1: blocking reasons beat capacity. Offering a waitlist place
  // to someone who is not qualified to take it would be a false promise.
  if (reasons.size > 0) {
    return { status: 'BLOCKED', reasons: [...reasons].sort() };
  }

  const status = assessCapacity(ctx).outcome === 'WAITLIST' ? 'WAITLIST' : 'ELIGIBLE';
  return { status, reasons: [] };
}

export interface EligibilityChecker {
  /** The signature SPEC.md names. Dataset and policy are bound by createChecker. */
  checkEligibility(volunteerId: string, openingId: string): EligibilityResult;
  /** SPEC.md "Nice to have" — keyed by openingId. Implemented in Task 11. */
  checkOpportunity(volunteerId: string, opportunityId: string): Record<string, EligibilityResult>;
}

export function createChecker(
  dataset: Dataset,
  policy: PolicyConfig = DEFAULT_POLICY,
): EligibilityChecker {
  function contextFor(volunteer: VolunteerContext, openingId: string): EvalContext {
    return { dataset, policy, volunteer, target: resolveTarget(dataset, openingId) };
  }

  return {
    checkEligibility(volunteerId, openingId) {
      return evaluate(contextFor(buildVolunteerContext(dataset, volunteerId, policy), openingId));
    },
    checkOpportunity() {
      throw new Error('not implemented');
    },
  };
}
```

- [ ] **Step 5: Create `src/index.ts`**

```ts
export { createChecker, evaluate } from './eligibility.js';
export type { EligibilityChecker } from './eligibility.js';
export { buildDataset, loadDataset, UnknownRecordError } from './dataset.js';
export type { Dataset } from './dataset.js';
export { DEFAULT_POLICY } from './policy.js';
export type { PolicyConfig } from './policy.js';
export type {
  EligibilityResult,
  EligibilityStatus,
  FixtureData,
  ReasonCode,
} from './types.js';
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run tests/cases.test.ts && npx tsc --noEmit`
Expected: 13 tests PASS (1 count check + 12 scenarios), no type errors.

If any scenario fails, the failure names the case. Do not edit `fixtures/cases.json` — the bug is in a rule.

- [ ] **Step 7: Run the whole suite**

Run: `npx vitest run`
Expected: all tests from Tasks 1–9 PASS.

- [ ] **Step 8: Commit**

```bash
git add src/rules/index.ts src/eligibility.ts src/index.ts tests/cases.test.ts
git commit -m "feat: assemble checkEligibility and pass all supplied cases"
```

---

### Task 10: Edge-case suite for the rules the supplied cases never reach

`fixtures/cases.json` never exercises `DISALLOWED_QUALIFICATION`, `GROUP_RESTRICTED`, or `WAITLIST_FULL` — precisely the contested rules (`OBSERVATIONS.md` §4). It also never exercises reason accumulation beyond two codes, or the group short-circuit. This task closes that gap at the `checkEligibility` level, where the interactions between rules are visible.

**Files:**
- Create: `tests/eligibility.test.ts`

**Interfaces:**
- Consumes: `createChecker` from Task 9, `buildDataset`/`loadDataset` from Task 1, `DEFAULT_POLICY` from Task 2.
- Produces: no source changes. If a test here fails, fix the rule it exposes.

- [ ] **Step 1: Write the test suite**

Create `tests/eligibility.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the suite**

Run: `npx vitest run tests/eligibility.test.ts`
Expected: 15 tests PASS.

If any fail, the failure identifies a rule that needs fixing. Fix the rule in `src/`, not the test — each of these assertions is traceable to a numbered decision in `OBSERVATIONS.md`.

- [ ] **Step 3: Commit**

```bash
git add tests/eligibility.test.ts
git commit -m "test: cover the reason codes and interactions the supplied cases miss"
```

---

### Task 11: Bulk checkOpportunity

`SPEC.md` "Nice to have": "It would also be good if this worked for a whole opportunity at once, so the volunteer browse page stays fast." The context object from Task 2 exists for this — the volunteer's qualifications, groups, waivers, and confirmed shifts are resolved once and reused across every opening.

**Files:**
- Modify: `src/eligibility.ts` — replace the `checkOpportunity` stub
- Test: `tests/opportunity.test.ts`

**Interfaces:**
- Consumes: `evaluate`, `buildVolunteerContext`, `resolveTarget`, `Dataset.openingsForOpportunity`.
- Produces: working `checkOpportunity(volunteerId, opportunityId): Record<string, EligibilityResult>`, keyed by opening id.

- [ ] **Step 1: Write the failing test**

Create `tests/opportunity.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { buildDataset, loadDataset, UnknownRecordError } from '../src/dataset.js';
import { createChecker } from '../src/eligibility.js';
import { FIXTURE_PATH } from './helpers.js';

const dataset = loadDataset(FIXTURE_PATH);
const checker = createChecker(dataset);

describe('checkOpportunity', () => {
  it('returns a result for every opening under the opportunity', () => {
    const results = checker.checkOpportunity('vol-001', 'opp-warehouse');
    expect(Object.keys(results).sort()).toEqual([
      'open-warehouse-mon-late-loader',
      'open-warehouse-mon-loader',
    ]);
  });

  it('agrees with checkEligibility opening by opening', () => {
    for (const opportunityId of ['opp-meals', 'opp-warehouse', 'opp-youth', 'opp-kitchen']) {
      for (const volunteerId of dataset.raw.volunteers.map((volunteer) => volunteer.id)) {
        const bulk = checker.checkOpportunity(volunteerId, opportunityId);
        for (const [openingId, result] of Object.entries(bulk)) {
          expect(result, `${volunteerId} / ${openingId}`).toEqual(
            checker.checkEligibility(volunteerId, openingId),
          );
        }
      }
    }
  });

  it('covers every opening in the fixture across all opportunities', () => {
    const seen = new Set<string>();
    for (const opportunity of dataset.raw.opportunities) {
      for (const openingId of Object.keys(checker.checkOpportunity('vol-001', opportunity.id))) {
        seen.add(openingId);
      }
    }
    expect(seen.size).toBe(dataset.raw.openings.length);
  });

  it('resolves the volunteer once regardless of how many openings are checked', () => {
    // This is the entire point of the bulk API. opp-meals has 6 openings.
    const spy = vi.spyOn(dataset, 'volunteer');
    createChecker(dataset).checkOpportunity('vol-001', 'opp-meals');
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it('returns an empty object for an opportunity with no openings', () => {
    // Not an error: an opportunity may exist before any shifts are scheduled.
    const data = structuredClone(dataset.raw);
    data.opportunities.push({
      id: 'opp-empty',
      organizationId: 'org-1',
      name: 'Not Yet Scheduled',
      city: 'Indianapolis',
      requiredWaiverId: null,
      restrictedToGroupIds: [],
      qualificationRules: [],
    });
    expect(createChecker(buildDataset(data)).checkOpportunity('vol-001', 'opp-empty')).toEqual({});
  });

  it('throws for an unknown volunteer', () => {
    expect(() => checker.checkOpportunity('vol-999', 'opp-meals')).toThrow(UnknownRecordError);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/opportunity.test.ts`
Expected: FAIL with "not implemented".

- [ ] **Step 3: Replace the stub in `src/eligibility.ts`**

Replace the `checkOpportunity` property inside the object returned by `createChecker`:

```ts
    checkOpportunity(volunteerId, opportunityId) {
      // The volunteer's qualifications, groups, waivers and committed shifts do not
      // change from one opening to the next, so they are resolved exactly once.
      // SPEC.md "Nice to have": the browse page renders a whole opportunity at a time.
      const volunteer = buildVolunteerContext(dataset, volunteerId, policy);
      const results: Record<string, EligibilityResult> = {};

      for (const opening of dataset.openingsForOpportunity(opportunityId)) {
        results[opening.id] = evaluate(contextFor(volunteer, opening.id));
      }

      return results;
    },
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/opportunity.test.ts && npx tsc --noEmit`
Expected: 6 tests PASS, no type errors.

- [ ] **Step 5: Run the whole suite**

Run: `npx vitest run`
Expected: every test from Tasks 1–11 PASS.

- [ ] **Step 6: Commit**

```bash
git add src/eligibility.ts tests/opportunity.test.ts
git commit -m "feat: bulk checkOpportunity reusing one volunteer context"
```

---

### Task 12: CLI runner and README

`SPEC.md`: "A function and a way to run it is all we need." This is the way to run it, plus the note the brief asks for saying how to run the code and tests.

**Files:**
- Create: `src/cli.ts`
- Modify: `README.md` — append a "Running this" section. The existing exercise brief above it stays untouched.

**Interfaces:**
- Consumes: `createChecker`, `loadDataset`, `UnknownRecordError`, `DEFAULT_POLICY`, `PolicyConfig`.
- Produces: a CLI. No exports.

- [ ] **Step 1: Write the failing test**

Create `tests/cli.test.ts`:

```ts
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const CLI = fileURLToPath(new URL('../src/cli.ts', import.meta.url));
const ROOT = fileURLToPath(new URL('..', import.meta.url));

function run(args: string[]): { stdout: string; status: number } {
  try {
    return { stdout: execFileSync('npx', ['tsx', CLI, ...args], { cwd: ROOT, encoding: 'utf8' }), status: 0 };
  } catch (error) {
    const failure = error as { stdout?: string; stderr?: string; status?: number };
    return { stdout: (failure.stdout ?? '') + (failure.stderr ?? ''), status: failure.status ?? 1 };
  }
}

describe('cli', () => {
  it('prints a single eligibility result as JSON', () => {
    const { stdout, status } = run(['vol-001', 'open-meals-mon-pm-server']);
    expect(status).toBe(0);
    expect(JSON.parse(stdout)).toEqual({ status: 'ELIGIBLE', reasons: [] });
  });

  it('prints every opening under an opportunity with --opportunity', () => {
    const { stdout, status } = run(['--opportunity', 'vol-001', 'opp-warehouse']);
    expect(status).toBe(0);
    expect(Object.keys(JSON.parse(stdout)).sort()).toEqual([
      'open-warehouse-mon-late-loader',
      'open-warehouse-mon-loader',
    ]);
  });

  it('honours --literal-disallowed', () => {
    const { stdout } = run(['--literal-disallowed', 'vol-006', 'open-warehouse-mon-loader']);
    expect(JSON.parse(stdout).status).toBe('ELIGIBLE');
    const { stdout: withDefault } = run(['vol-006', 'open-warehouse-mon-loader']);
    expect(JSON.parse(withDefault).status).toBe('BLOCKED');
  });

  it('exits non-zero with a readable message for an unknown id', () => {
    const { stdout, status } = run(['vol-999', 'open-meals-mon-pm-server']);
    expect(status).toBe(1);
    expect(stdout).toMatch(/Unknown volunteer: vol-999/);
  });

  it('exits non-zero with usage when given too few arguments', () => {
    const { stdout, status } = run(['vol-001']);
    expect(status).toBe(1);
    expect(stdout).toMatch(/Usage/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/cli.test.ts`
Expected: FAIL — `src/cli.ts` does not exist.

- [ ] **Step 3: Create `src/cli.ts`**

```ts
import { fileURLToPath } from 'node:url';
import { loadDataset, UnknownRecordError } from './dataset.js';
import { createChecker } from './eligibility.js';
import { DEFAULT_POLICY } from './policy.js';
import type { PolicyConfig } from './policy.js';

const USAGE = `Usage:
  npm run check -- <volunteerId> <openingId>
  npm run check -- --opportunity <volunteerId> <opportunityId>

Options:
  --opportunity           Check every opening under an opportunity at once.
  --literal-disallowed    Read DOES_NOT_HAVE_ALL literally (block only volunteers
                          holding EVERY listed qualification) instead of as an
                          exclusion list. See OBSERVATIONS.md section 1.1.
`;

function main(argv: string[]): number {
  const flags = new Set(argv.filter((arg) => arg.startsWith('--')));
  const positional = argv.filter((arg) => !arg.startsWith('--'));

  if (positional.length !== 2) {
    process.stderr.write(USAGE);
    return 1;
  }

  const [volunteerId, targetId] = positional as [string, string];

  const policy: PolicyConfig = flags.has('--literal-disallowed')
    ? { ...DEFAULT_POLICY, disallowedQualificationSemantics: 'ALL' }
    : DEFAULT_POLICY;

  const fixturePath = fileURLToPath(new URL('../fixtures/fixtures.json', import.meta.url));
  const checker = createChecker(loadDataset(fixturePath), policy);

  try {
    const result = flags.has('--opportunity')
      ? checker.checkOpportunity(volunteerId, targetId)
      : checker.checkEligibility(volunteerId, targetId);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  } catch (error) {
    if (error instanceof UnknownRecordError) {
      process.stderr.write(`${error.message}\n`);
      return 1;
    }
    throw error;
  }
}

// Setting exitCode rather than calling process.exit() lets Node flush stdout before
// exiting. process.exit() can truncate piped output, which the CLI tests would catch
// intermittently and confusingly.
process.exitCode = main(process.argv.slice(2));
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/cli.test.ts`
Expected: 5 tests PASS.

- [ ] **Step 5: Append the "Running this" section to `README.md`**

Append to the end of the existing `README.md`:

```markdown

---

# Running this

My submission. The exercise brief is above; what follows is the code.

## Requirements

Node 20 or newer. No other tooling, and no runtime dependencies.

## Install

```bash
npm install
```

## Run the tests

```bash
npm test          # once
npm run test:watch
npm run typecheck # tsc --noEmit
```

`tests/cases.test.ts` runs all twelve scenarios from `fixtures/cases.json` unmodified.
`tests/eligibility.test.ts` covers the three reason codes those cases never exercise
(`DISALLOWED_QUALIFICATION`, `GROUP_RESTRICTED`, `WAITLIST_FULL`) and the rule
interactions they miss.

## Run the checker

```bash
npm run check -- vol-001 open-meals-mon-pm-server
npm run check -- --opportunity vol-001 opp-meals
npm run check -- --literal-disallowed vol-006 open-warehouse-mon-loader
```

## Where things are

| Path | What it holds |
| --- | --- |
| `src/eligibility.ts` | `checkEligibility` and `checkOpportunity`, and how status is derived |
| `src/rules/` | One file per rule in `SPEC.md`; `rules/index.ts` is the registry |
| `src/policy.ts` | Every behaviour the spec left ambiguous, with the default chosen |
| `src/context.ts` | Per-volunteer facts resolved once and reused across openings |
| `OBSERVATIONS.md` | What I found wrong in the spec and how I resolved each one |
| `DECISIONS.md` | The short version, for a reader with ten minutes |

## The two decisions worth arguing about

`SPEC.md` contradicts itself twice. Both resolutions are in `src/policy.ts` and both
can be flipped without touching rule logic.

1. **`DOES_NOT_HAVE_ALL`** — the rule table and the Fern worked example give opposite
   answers for the same volunteer. I implemented it as an exclusion list, following the
   example, because the failure modes are not symmetric. `OBSERVATIONS.md` §1.1.
2. **Group restrictions** — rule 5 requires a block with no explanation, contradicting
   the spec's own headline promise. I short-circuit so the volunteer is never given a
   partial list they can act on fruitlessly. `OBSERVATIONS.md` §1.2.
```

- [ ] **Step 6: Verify everything from a clean state**

Run: `npx vitest run && npx tsc --noEmit && npm run check -- vol-006 open-warehouse-mon-loader`
Expected: all tests PASS, no type errors, and the last command prints
`{"status": "BLOCKED", "reasons": ["DISALLOWED_QUALIFICATION"]}` (formatted).

- [ ] **Step 7: Commit**

```bash
git add src/cli.ts tests/cli.test.ts README.md
git commit -m "feat: CLI runner and how-to-run documentation"
```

---

## After the plan

`DECISIONS.md` is still the template. It is the part the brief says is read most
carefully, and it is deliberately not a task here — it should be written last, by hand,
from `OBSERVATIONS.md`, once the code exists and the arguments have survived contact
with the implementation. `OBSERVATIONS.md` is the long form; `DECISIONS.md` is the page
a product manager reads.

Sections that write themselves from what is already recorded:

- **What I built** — the rule pipeline, and why rules are separate files.
- **Assumptions I made** — `OBSERVATIONS.md` §2, one line each.
- **Problems I found in the spec** — `OBSERVATIONS.md` §1, plus §3.1 (timezones).
- **What I deliberately did not build** — travel-time buffers (§3.2), a past-shift rule
  (§2.9), per-qualification detail in the reason codes (§4.1), and a configurable rule
  engine, which was considered and rejected as gold-plating for a four-rule spec.
- **What I'd do with three more hours** — timezone-correct conflict detection first,
  since it is a live correctness defect rather than a missing feature.
