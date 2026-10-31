// Plan morning-digest, section 1. The shapes the digest page, its JSON and the status board
// all read; the reader in read.ts is the only thing that builds them.
export type RunStatus = 'ok' | 'retry' | 'fail';

// One job's night. Times are `at` as written in the log, offset kept, never converted to UTC.
export type DigestRow = {
  job: string;
  owner: string | null; // from the job's most recent line; views show null as `—`
  runs: number; // every parsed line of the job
  retries: number; // lines with status `retry`
  lastStatus: RunStatus; // status of the job's most recent line
  lastError: string | null; // most recent `error` seen for the job, null if none
  firstAt: string;
  lastAt: string;
};

// Parsed lines per status, across all jobs of the night.
export type StatusCounts = Record<RunStatus, number>;

export type DigestNight = {
  night: string; // YYYY-MM-DD
  rows: DigestRow[]; // sorted by job; empty when nothing ran
  badLines: number; // lines that didn't parse or lack a valid at / job / status
  counts: StatusCounts;
};

// null = no file: the night isn't YYYY-MM-DD or runs/<night>.jsonl doesn't exist (routes 404).
// An empty file is a night with zero rows, not null. Never throws on a bad line.
export type ReadNight = (runsDir: string, night: string) => DigestNight | null;
