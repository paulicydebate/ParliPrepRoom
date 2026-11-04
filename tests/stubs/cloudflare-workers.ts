// Stand-in for the `cloudflare:workers` module so the server's Directory class
// can run in tests against a real (in-memory) SQLite database.
import { DatabaseSync } from 'node:sqlite';

export class FakeSql {
  private db = new DatabaseSync(':memory:');
  /** Tests can make some statements fail (e.g. a full database). Return true to throw. */
  failWhen: ((query: string) => boolean) | null = null;
  /** Every statement run, newest last (tests check which tables were read). */
  log: string[] = [];
  exec(query: string, ...params: unknown[]) {
    this.log.push(query);
    if (this.failWhen?.(query)) throw new Error('simulated: storage is full');
    const q = query.trim();
    let rows: Record<string, unknown>[] = [];
    if (params.length === 0 && q.replace(/;\s*$/, '').includes(';')) this.db.exec(q);
    else rows = this.db.prepare(q).all(...(params as never[])) as Record<string, unknown>[];
    return { toArray: () => rows, [Symbol.iterator]: () => rows[Symbol.iterator]() };
  }
}

export class DurableObject {
  ctx: { storage: { sql: FakeSql }; blockConcurrencyWhile: (fn: () => Promise<void> | void) => void };
  env: unknown;
  constructor(ctx: unknown, env: unknown) {
    this.ctx = ctx as DurableObject['ctx'];
    this.env = env;
  }
}

/** A fresh context for `new Directory(newContext(), {})`. Use `await settle()` is not needed: setup runs synchronously. */
export function newContext() {
  return {
    storage: { sql: new FakeSql() },
    blockConcurrencyWhile: (fn: () => Promise<void> | void) => void fn(),
    getWebSockets: () => [] as unknown[],
    acceptWebSocket: () => {},
  };
}
