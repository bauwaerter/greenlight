import { describe, expect, it } from 'vitest';
import { loadDataset } from '../src/dataset.js';
import { renderVolunteerList, renderVolunteerReport } from '../src/render.js';
import { buildVolunteerReport, listVolunteers } from '../src/report.js';
import { FIXTURE_PATH } from './helpers.js';

const dataset = loadDataset(FIXTURE_PATH);

describe('renderVolunteerList', () => {
  it('lists every volunteer with their id', () => {
    const text = renderVolunteerList(listVolunteers(dataset));
    expect(text).toContain('vol-001');
    expect(text).toContain('Avery Chen');
    expect(text).toContain('Fern Okonjo');
    expect(text.split('\n').filter((line) => line.includes('vol-'))).toHaveLength(8);
  });
});

describe('renderVolunteerReport', () => {
  const text = renderVolunteerReport(buildVolunteerReport(dataset, 'vol-006'));

  it('heads with the volunteer name and id', () => {
    expect(text).toContain('Fern Okonjo');
    expect(text).toContain('vol-006');
  });

  it('groups rows under an opportunity heading with its city', () => {
    expect(text).toContain('Warehouse Sort and Load');
    expect(text).toContain('Denver');
  });

  it('renders reason codes as readable prose, not shouted constants', () => {
    expect(text).toContain('disallowed qualification');
    expect(text).not.toContain('DISALLOWED_QUALIFICATION');
  });

  it('shows a status marker for each row', () => {
    const eligible = renderVolunteerReport(buildVolunteerReport(dataset, 'vol-007'));
    expect(eligible).toMatch(/\+\s+Monday Sort · Loader\s+ELIGIBLE/);
    expect(text).toMatch(/x\s+Monday Sort · Loader\s+BLOCKED/);
  });

  it('marks a waitlist row distinctly', () => {
    const waitlisted = renderVolunteerReport(buildVolunteerReport(dataset, 'vol-001'));
    expect(waitlisted).toMatch(/~\s+Tuesday Lunch Service · Server\s+WAITLIST/);
  });

  it('carries the summary counts', () => {
    const report = buildVolunteerReport(dataset, 'vol-007');
    expect(renderVolunteerReport(report)).toContain('3 eligible');
    expect(renderVolunteerReport(report)).toContain('8 blocked');
  });

  it('says plainly when a volunteer is given no reason, and points at --staff', () => {
    // The whole point of the surface: SPEC.md rule 5 made visible.
    expect(text).toContain('(no reason given)');
    expect(text).toContain('--staff');
  });

  it('replaces that with the withheld reason under the staff audience', () => {
    const staff = renderVolunteerReport(
      buildVolunteerReport(dataset, 'vol-006', { audience: 'STAFF' }),
    );
    expect(staff).toContain('staff view');
    expect(staff).toContain('group restricted');
    expect(staff).not.toContain('(no reason given)');
    expect(staff).not.toContain('--staff to see');
  });

  it('omits the staff hint when no row is silently blocked', () => {
    // vol-001 is in group-acme, so nothing is withheld from them.
    const clean = renderVolunteerReport(buildVolunteerReport(dataset, 'vol-001'));
    expect(clean).not.toContain('(no reason given)');
    expect(clean).not.toContain('--staff to see');
  });

  it('produces output with no trailing whitespace on any line', () => {
    for (const line of text.split('\n')) expect(line).toBe(line.trimEnd());
  });
});
