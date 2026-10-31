import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/read.js';

const tmp = mkdtempSync(join(tmpdir(), 'rig-digest-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

function night(name: string, lines: string[]): string {
  writeFileSync(join(tmp, `${name}.jsonl`), lines.join('\n'));
  return name;
}

describe('readNight on runs/2026-10-28.jsonl', () => {
  const result = readNight('runs', '2026-10-28')!;
  const row = (job: string) => result.rows.find((r) => r.job === job)!;

  it('has 5 jobs sorted by job and counts the truncated line as bad', () => {
    expect(result.night).toBe('2026-10-28');
    expect(result.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
    expect(result.badLines).toBe(1);
    expect(result.counts).toEqual({ ok: 10, retry: 4, fail: 1 });
  });

  it('keeps a job whose owner is null', () => {
    expect(row('digest/render')).toMatchObject({ owner: null, runs: 1, lastStatus: 'ok', lastError: null });
  });

  it('counts runs and retries, and keeps the last error after a recovery', () => {
    expect(row('fixtures/refresh')).toEqual({
      job: 'fixtures/refresh',
      owner: 'rook',
      runs: 4,
      retries: 3,
      lastStatus: 'ok',
      lastError: 'upstream 503',
      firstAt: '2026-10-29T01:30:00+01:00',
      lastAt: '2026-10-29T01:37:00+01:00',
    });
    expect(row('notes/backup')).toMatchObject({ lastStatus: 'fail', lastError: 'quota exceeded' });
  });

  it('keeps times as written, offset included', () => {
    expect(row('lane/sync')).toMatchObject({
      runs: 8,
      retries: 1,
      firstAt: '2026-10-28T23:00:06+01:00',
      lastAt: '2026-10-29T05:00:04+01:00',
    });
  });
});

describe('readNight edge cases', () => {
  it('reads an empty file as a night where nothing ran', () => {
    expect(readNight(tmp, night('2026-01-01', []))).toEqual({
      night: '2026-01-01',
      rows: [],
      badLines: 0,
      counts: { ok: 0, retry: 0, fail: 0 },
    });
  });

  it('reads a missing file or a night that is not YYYY-MM-DD as no file', () => {
    expect(readNight(tmp, '2026-01-02')).toBeNull();
    expect(readNight(tmp, '../runs/2026-10-28')).toBeNull();
    expect(readNight('runs', '28-10-2026')).toBeNull();
  });

  it('counts JSON lines without a valid at, job or status as bad, and skips blank lines', () => {
    const result = readNight(
      tmp,
      night('2026-01-03', [
        '{"at":"2026-01-03T01:00:00+01:00","job":"a","status":"ok"}',
        '',
        '{"at":"yesterday","job":"a","status":"ok"}',
        '{"at":"2026-01-03T01:00:00+01:00","status":"ok"}',
        '{"at":"2026-01-03T01:00:00+01:00","job":"a","status":"done"}',
        '[1,2]',
        '   ',
      ]),
    )!;
    expect(result.badLines).toBe(4);
    expect(result.rows).toEqual([
      {
        job: 'a',
        owner: null,
        runs: 1,
        retries: 0,
        lastStatus: 'ok',
        lastError: null,
        firstAt: '2026-01-03T01:00:00+01:00',
        lastAt: '2026-01-03T01:00:00+01:00',
      },
    ]);
  });

  it('takes the last status from the latest at instant, not file order', () => {
    const result = readNight(
      tmp,
      night('2026-01-04', [
        '{"at":"2026-01-04T03:00:00+01:00","job":"b","status":"fail","owner":"rook","error":"boom"}',
        '{"at":"2026-01-04T01:00:00Z","job":"b","status":"ok","owner":"lane-07"}',
      ]),
    )!;
    expect(result.rows[0]).toMatchObject({
      owner: 'rook',
      lastStatus: 'fail',
      lastError: 'boom',
      firstAt: '2026-01-04T01:00:00Z',
      lastAt: '2026-01-04T03:00:00+01:00',
    });
  });
});
