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
    audience: 'VOLUNTEER',
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
