import Database from 'better-sqlite3';
import { join } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS loop_state (
  flow_name TEXT NOT NULL,
  loop_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  iterations_run INTEGER NOT NULL DEFAULT 0,
  completed_at TEXT,
  PRIMARY KEY (flow_name, loop_key)
);
`;

let _db: Database.Database | null = null;

export function getDb(cwd: string): Database.Database {
  if (_db) return _db;
  const dir = join(cwd, '.ralph-flow');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  _db = new Database(join(dir, '.ralphflow.db'));
  _db.pragma('journal_mode = WAL');
  _db.exec(SCHEMA);
  return _db;
}

export function getLoopStatus(db: Database.Database, flow: string, loopKey: string): string {
  const row = db.prepare('SELECT status FROM loop_state WHERE flow_name = ? AND loop_key = ?').get(flow, loopKey) as { status: string } | undefined;
  return row ? row.status : 'pending';
}

export function isLoopComplete(db: Database.Database, flow: string, loopKey: string): boolean {
  return getLoopStatus(db, flow, loopKey) === 'complete';
}

export function markLoopRunning(db: Database.Database, flow: string, loopKey: string): void {
  db.prepare(`
    INSERT INTO loop_state (flow_name, loop_key, status, iterations_run)
    VALUES (?, ?, 'running', 0)
    ON CONFLICT(flow_name, loop_key) DO UPDATE SET status = 'running'
  `).run(flow, loopKey);
}

export function incrementIteration(db: Database.Database, flow: string, loopKey: string): void {
  db.prepare(`
    UPDATE loop_state SET iterations_run = iterations_run + 1
    WHERE flow_name = ? AND loop_key = ?
  `).run(flow, loopKey);
}

export function markLoopComplete(db: Database.Database, flow: string, loopKey: string): void {
  db.prepare(`
    UPDATE loop_state SET status = 'complete', completed_at = datetime('now')
    WHERE flow_name = ? AND loop_key = ?
  `).run(flow, loopKey);
}

export function resetLoopState(db: Database.Database, flow: string, loopKey: string): void {
  db.prepare('DELETE FROM loop_state WHERE flow_name = ? AND loop_key = ?').run(flow, loopKey);
}

export function deleteFlowState(db: Database.Database, flow: string): void {
  db.prepare('DELETE FROM loop_state WHERE flow_name = ?').run(flow);
}

export function getAllLoopStates(db: Database.Database, flow: string) {
  return db.prepare('SELECT * FROM loop_state WHERE flow_name = ?').all(flow);
}
