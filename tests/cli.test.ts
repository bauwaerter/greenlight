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

  it('prints usage for --help and exits zero', () => {
    const { stdout, status } = run(['--help']);
    expect(status).toBe(0);
    expect(stdout).toMatch(/Usage:/);
    expect(stdout).toMatch(/--staff/);
    expect(stdout).toMatch(/--literal-disallowed/);
  });

  it('accepts -h as well', () => {
    expect(run(['-h']).status).toBe(0);
  });

  it('lists volunteers with --list', () => {
    const { stdout, status } = run(['--list']);
    expect(status).toBe(0);
    expect(stdout).toContain('vol-001');
    expect(stdout).toContain('Fern Okonjo');
    expect(stdout.split('\n').filter((line) => line.includes('vol-'))).toHaveLength(8);
  });

  it('prints a readable report for one volunteer with --report', () => {
    const { stdout, status } = run(['--report', 'vol-006']);
    expect(status).toBe(0);
    expect(stdout).toContain('Fern Okonjo');
    expect(stdout).toContain('Warehouse Sort and Load');
    expect(stdout).toContain('disallowed qualification');
  });

  it('reports every volunteer with --report --all', () => {
    const { stdout, status } = run(['--report', '--all']);
    expect(status).toBe(0);
    for (const name of ['Avery Chen', 'Fern Okonjo', 'Hana Bergstrom']) {
      expect(stdout).toContain(name);
    }
  });

  it('withholds the group reason by default and reveals it with --staff', () => {
    const asVolunteer = run(['--report', 'vol-005']).stdout;
    expect(asVolunteer).toContain('(no reason given)');
    expect(asVolunteer).not.toContain('group restricted');

    const asStaff = run(['--report', '--staff', 'vol-005']).stdout;
    expect(asStaff).toContain('group restricted');
    expect(asStaff).not.toContain('(no reason given)');
  });

  it('applies --literal-disallowed to the report too', () => {
    expect(run(['--report', 'vol-006']).stdout).toContain('disallowed qualification');
    expect(run(['--report', '--literal-disallowed', 'vol-006']).stdout).not.toContain(
      'disallowed qualification',
    );
  });

  it('exits non-zero when --report is given no volunteer', () => {
    const { stdout, status } = run(['--report']);
    expect(status).toBe(1);
    expect(stdout).toMatch(/needs a volunteerId/);
  });

  it('exits non-zero for an unknown volunteer in report mode', () => {
    const { stdout, status } = run(['--report', 'vol-999']);
    expect(status).toBe(1);
    expect(stdout).toMatch(/Unknown volunteer: vol-999/);
  });
});
