import { fileURLToPath } from 'node:url';
import { loadDataset, UnknownRecordError } from './dataset.js';
import { createChecker } from './eligibility.js';
import { DEFAULT_POLICY } from './policy.js';
import type { PolicyConfig } from './policy.js';
import { renderVolunteerList, renderVolunteerReport } from './render.js';
import { buildVolunteerReport, listVolunteers } from './report.js';
import type { Audience } from './types.js';

const USAGE = `Volunteer shift eligibility.

Usage:
  npm run check -- <volunteerId> <openingId>                 one opening, as JSON
  npm run check -- --opportunity <volunteerId> <opportunityId>   one opportunity, as JSON
  npm run check -- --report <volunteerId>                    the whole catalog, readable
  npm run check -- --report --all                            every volunteer
  npm run check -- --list                                    list volunteer ids
  npm run check -- --help

Options:
  --staff                 Include reasons withheld from volunteers. A group-restricted
                          opening shows BLOCKED with no reason to a volunteer (SPEC.md
                          rule 5); this shows what a coordinator would see.
  --literal-disallowed    Read DOES_NOT_HAVE_ALL literally — block only volunteers
                          holding EVERY listed qualification — instead of as an
                          exclusion list. See OBSERVATIONS.md section 1.1.

Examples:
  npm run check -- --list
  npm run check -- --report vol-006
  npm run check -- --report --staff vol-005
  npm run check -- --literal-disallowed vol-006 open-warehouse-mon-loader
`;

const FIXTURE_PATH = fileURLToPath(new URL('../fixtures/fixtures.json', import.meta.url));

function main(argv: string[]): number {
  const flags = new Set(argv.filter((arg) => arg.startsWith('--')));
  const positional = argv.filter((arg) => !arg.startsWith('--'));

  if (flags.has('--help') || argv.includes('-h')) {
    process.stdout.write(USAGE);
    return 0;
  }

  const policy: PolicyConfig = flags.has('--literal-disallowed')
    ? { ...DEFAULT_POLICY, disallowedQualificationSemantics: 'ALL' }
    : DEFAULT_POLICY;
  const audience: Audience = flags.has('--staff') ? 'STAFF' : 'VOLUNTEER';

  const dataset = loadDataset(FIXTURE_PATH);

  if (flags.has('--list')) {
    process.stdout.write(renderVolunteerList(listVolunteers(dataset)));
    return 0;
  }

  if (flags.has('--report')) {
    const ids = flags.has('--all')
      ? listVolunteers(dataset).map((volunteer) => volunteer.id)
      : positional;

    if (ids.length === 0) {
      process.stderr.write('--report needs a volunteerId, or --all.\n\n');
      process.stderr.write(USAGE);
      return 1;
    }

    for (const volunteerId of ids) {
      process.stdout.write(
        renderVolunteerReport(buildVolunteerReport(dataset, volunteerId, { policy, audience })),
      );
    }
    return 0;
  }

  if (positional.length !== 2) {
    process.stderr.write(USAGE);
    return 1;
  }

  const [volunteerId, targetId] = positional as [string, string];
  const checker = createChecker(dataset, policy, audience);

  const result = flags.has('--opportunity')
    ? checker.checkOpportunity(volunteerId, targetId)
    : checker.checkEligibility(volunteerId, targetId);

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  return 0;
}

// Setting exitCode rather than calling process.exit() lets Node flush stdout before
// exiting. process.exit() can truncate piped output, which the CLI tests would catch
// intermittently and confusingly.
try {
  process.exitCode = main(process.argv.slice(2));
} catch (error) {
  if (error instanceof UnknownRecordError) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  } else {
    throw error;
  }
}
