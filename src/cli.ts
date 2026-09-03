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
