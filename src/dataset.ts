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
