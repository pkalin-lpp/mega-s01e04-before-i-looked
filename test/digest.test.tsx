import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { DigestNight } from '../src/digest/types.js';

const config = { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir: 'runs' };

const busy = [
  '{"at":"2026-10-28T23:00:02+01:00","job":"rig/rotate-logs","status":"ok","owner":"lane-07"}',
  '{"at":"2026-10-28T23:00:06+01:00","job":"lane/sync","status":"ok","owner":"rook"}',
  '{"at":"2026-10-29T01:30:00+01:00","job":"fixtures/refresh","status":"retry","owner":"rook","error":"upstream 503"}',
  '{"at":"2026-10-29T02:30:00+01:00","job":"fixtures/refresh","status":"ok","owner":"rook"}',
  '{"at":"2026-10-29T03:00:00+01:00","job":"lane/sync","status":"ok","owner":null}',
  '{"at":"2026-10-29T04:00:00+01:00","job":"lane/sy',
];

let runsDir: string;
let app: ReturnType<typeof createApp>;

beforeAll(() => {
  runsDir = mkdtempSync(join(tmpdir(), 'rig-digest-'));
  writeFileSync(join(runsDir, '2026-10-28.jsonl'), busy.join('\n') + '\n');
  writeFileSync(join(runsDir, '2026-10-29.jsonl'), '');
  app = createApp({ ...config, runsDir });
});

afterAll(() => {
  rmSync(runsDir, { recursive: true, force: true });
});

describe('GET /api/digest/:night', () => {
  it('returns the night as JSON with rows sorted by job and a bad line counted', async () => {
    const res = await app.request('/api/digest/2026-10-28');
    expect(res.status).toBe(200);
    const night = (await res.json()) as DigestNight;
    expect(night.night).toBe('2026-10-28');
    expect(night.badLines).toBe(1);
    expect(night.rows.map((r) => r.job)).toEqual(['fixtures/refresh', 'lane/sync', 'rig/rotate-logs']);
  });

  it('counts runs and retries per job, and takes owner from the latest line', async () => {
    const night = (await (await app.request('/api/digest/2026-10-28')).json()) as DigestNight;
    const byJob = Object.fromEntries(night.rows.map((r) => [r.job, r]));
    expect(byJob['fixtures/refresh']).toMatchObject({ runs: 2, retries: 1, lastStatus: 'ok', lastError: 'upstream 503' });
    expect(byJob['lane/sync']).toMatchObject({ runs: 2, retries: 0, owner: null });
    expect(byJob['rig/rotate-logs']).toMatchObject({ runs: 1, owner: 'lane-07' });
  });

  it('returns an empty night with no rows', async () => {
    const res = await app.request('/api/digest/2026-10-29');
    expect(res.status).toBe(200);
    expect(((await res.json()) as DigestNight).rows).toEqual([]);
  });

  it('404s for a night with no file', async () => {
    const res = await app.request('/api/digest/2026-11-01');
    expect(res.status).toBe(404);
  });
});

describe('GET /digest/:night', () => {
  it('renders one table with a row per job, in the same order as the JSON', async () => {
    const res = await app.request('/digest/2026-10-28');
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html.match(/<table/g)).toHaveLength(1);

    const night = (await (await app.request('/api/digest/2026-10-28')).json()) as DigestNight;
    const positions = night.rows.map((r) => html.indexOf(r.job));
    positions.forEach((p) => expect(p).toBeGreaterThan(-1));
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it('shows a null owner as an em dash', async () => {
    const html = await (await app.request('/digest/2026-10-28')).text();
    expect(html).toContain('—');
  });

  it('renders an empty night as "nothing ran"', async () => {
    const res = await app.request('/digest/2026-10-29');
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('nothing ran');
  });

  it('404s for a night with no file', async () => {
    const res = await app.request('/digest/2026-11-01');
    expect(res.status).toBe(404);
  });
});
