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
