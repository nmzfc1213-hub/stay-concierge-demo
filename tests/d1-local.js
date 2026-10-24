import { DatabaseSync } from 'node:sqlite';

// Test adapter backed by real SQLite. It exercises SQL, constraints and
// rollback, but does not claim to simulate Cloudflare's deployment runtime.
export class LocalD1 {
  constructor() { this.sqlite = new DatabaseSync(':memory:'); }
  prepare(sql) {
    const connection = this.sqlite;
    const make = args => ({
      bind: (...values) => make(values),
      async first() { return connection.prepare(sql).get(...args) || null; },
      async all() { return { results: connection.prepare(sql).all(...args) }; },
      async run() { return connection.prepare(sql).run(...args); },
      execute() {
        const prepared = connection.prepare(sql);
        return prepared.columns().length ? { results: prepared.all(...args) } : prepared.run(...args);
      }
    });
    return make([]);
  }
  async batch(statements) {
    this.sqlite.exec('BEGIN');
    try {
      const result = statements.map(statement => statement.execute());
      this.sqlite.exec('COMMIT');
      return result;
    } catch (error) {
      this.sqlite.exec('ROLLBACK');
      throw error;
    }
  }
}
