import type { ReasonCode } from './types.js';
import type { ReportRow, VolunteerReport } from './report.js';

const MARK: Record<ReportRow['status'], string> = {
  ELIGIBLE: '+',
  WAITLIST: '~',
  BLOCKED: 'x',
};

/**
 * Plain ASCII and no colour, deliberately. This output is meant to be pasted into a
 * pull request, piped through grep, and asserted on in tests; escape codes would
 * survive none of that.
 */
function humanise(reasons: ReasonCode[]): string {
  return reasons.map((code) => code.toLowerCase().replaceAll('_', ' ')).join(', ');
}

export function renderVolunteerList(volunteers: { id: string; name: string }[]): string {
  const width = Math.max(...volunteers.map((volunteer) => volunteer.id.length));
  const lines = volunteers.map(
    (volunteer) => `  ${volunteer.id.padEnd(width)}  ${volunteer.name}`,
  );
  return ['', ...lines, ''].join('\n');
}

export function renderVolunteerReport(report: VolunteerReport): string {
  const rows = report.opportunities.flatMap((opportunity) => opportunity.rows);
  const labelWidth = Math.max(...rows.map((row) => row.label.length));

  // A volunteer told BLOCKED with nothing else is SPEC.md rule 5 in action. Naming it
  // is the difference between the surface looking broken and looking deliberate.
  const silent = rows.some((row) => row.status === 'BLOCKED' && row.reasons.length === 0);

  const { eligible, waitlist, blocked } = report.summary;
  const view = report.audience === 'STAFF' ? 'staff view' : 'volunteer view';

  const lines: string[] = [
    '',
    `  ${report.name}  (${report.volunteerId})`,
    `  ${view} · ${eligible} eligible, ${waitlist} waitlist, ${blocked} blocked`,
    '',
  ];

  for (const opportunity of report.opportunities) {
    lines.push(`  ${opportunity.name} — ${opportunity.city}`);

    for (const row of opportunity.rows) {
      const why =
        row.reasons.length > 0
          ? humanise(row.reasons)
          : row.status === 'BLOCKED'
            ? '(no reason given)'
            : '';
      const line = `    ${MARK[row.status]} ${row.label.padEnd(labelWidth)}  ${row.status.padEnd(8)}  ${why}`;
      lines.push(line.trimEnd());
    }

    lines.push('');
  }

  if (silent) {
    lines.push(
      '  Rows with no reason are group-restricted opportunities. SPEC.md rule 5 keeps',
      '  group membership confidential, so the volunteer is told nothing. Re-run with',
      '  --staff to see what a coordinator would see.',
      '',
    );
  }

  return lines.join('\n');
}
