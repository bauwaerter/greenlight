import { fileURLToPath } from 'node:url';

export const FIXTURE_PATH = fileURLToPath(
  new URL('../fixtures/fixtures.json', import.meta.url),
);

export const CASES_PATH = fileURLToPath(
  new URL('../fixtures/cases.json', import.meta.url),
);
