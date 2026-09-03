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
