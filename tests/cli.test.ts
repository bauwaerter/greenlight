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
});
