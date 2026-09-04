const fs = require('fs');
const path = require('path');
const deasync = require('deasync');
const { Client } = require('pg');
const initSqlJs = require('sql.js');

function normalizeSql(sql) {
  let out = String(sql);
  out = out.replace(/INTEGER PRIMARY KEY AUTOINCREMENT/g, 'BIGSERIAL PRIMARY KEY');
  out = out.replace(/AUTOINCREMENT/g, '');
  out = out.replace(/INSERT OR IGNORE INTO\s+/gi, 'INSERT INTO ');
  return out;
}

function syncAwait(promise) {
  let done = false;
  let result;
  let error;
  promise.then((value) => {
    result = value;
    done = true;
  }).catch((err) => {
    error = err;
    done = true;
  });
  deasync.loopWhile(() => !done);
  if (error) throw error;
  return result;
}

class SqliteStatement {
  constructor(sqlDb, sql) {
    this._sqlDb = sqlDb;
    this._sql = sql;
  }
  run(...params) {
    this._sqlDb.run(this._sql, params.length ? params : []);
    const rows = this._sqlDb.exec('SELECT last_insert_rowid() as id');
    const lastId = rows.length > 0 ? rows[0].values[0][0] : 0;
    return { changes: this._sqlDb.getRowsModified(), lastInsertRowid: lastId };
  }
  get(...params) {
    const stmt = this._sqlDb.prepare(this._sql);
    try {
      stmt.bind(params.length ? params : []);
      if (stmt.step()) return stmt.getAsObject();
      return undefined;
    } finally {
      stmt.free();
    }
  }
  all(...params) {
    const stmt = this._sqlDb.prepare(this._sql);
    const results = [];
    try {
      stmt.bind(params.length ? params : []);
      while (stmt.step()) results.push(stmt.getAsObject());
    } finally {
      stmt.free();
    }
    return results;
  }
}

class SqliteWrapper {
  constructor(sqlDb) {
    this._sqlDb = sqlDb;
  }
  prepare(sql) {
    return new SqliteStatement(this._sqlDb, sql);
  }
  exec(sql) {
    return this._sqlDb.run(sql);
  }
  run(sql, params) {
    this._sqlDb.run(sql, params || []);
    return { changes: this._sqlDb.getRowsModified(), lastInsertRowid: 0 };
  }
  pragma(str) {
    try {
      this._sqlDb.run(`PRAGMA ${str}`);
    } catch (e) {}
  }
  export() {
    return this._sqlDb.export();
  }
}

class PostgresStatement {
  constructor(client, sql) {
    this._client = client;
    this._sql = sql;
  }
  _compile(params) {
    const values = Array.isArray(params) ? params : [];
    const text = this._sql;
    let result = '';
    let lastIndex = 0;
    let paramIndex = 1;
    let match;
    const regex = /\?/g;
    while ((match = regex.exec(text)) !== null) {
      result += text.slice(lastIndex, match.index) + `$${paramIndex}`;
      paramIndex += 1;
      lastIndex = match.index + 1;
    }
    result += text.slice(lastIndex);
    return { text: result, values };
  }
  run(...params) {
    const compiled = this._compile(params);
    const res = syncAwait(this._client.query(compiled.text, compiled.values));
    return { changes: res.rowCount ?? 0, lastInsertRowid: res.rows?.[0]?.id ?? 0 };
  }
  get(...params) {
    const compiled = this._compile(params);
    const res = syncAwait(this._client.query(compiled.text, compiled.values));
    return res.rows[0];
  }
  all(...params) {
    const compiled = this._compile(params);
    const res = syncAwait(this._client.query(compiled.text, compiled.values));
    return res.rows;
  }
}

class PostgresWrapper {
  constructor(client) {
    this._client = client;
  }
  prepare(sql) {
    return new PostgresStatement(this._client, sql);
  }
  exec(sql) {
    const normalized = normalizeSql(sql);
    return syncAwait(this._client.query(normalized));
  }
  run(sql, params) {
    const normalized = normalizeSql(sql);
    const result = syncAwait(this._client.query(normalized, params || []));
    return { changes: result.rowCount ?? 0, lastInsertRowid: result.rows?.[0]?.id ?? 0 };
  }
  pragma() {}
  export() {
    return null;
  }
}

async function createDbManager({ dataDir, dbPath, sqliteFileName, postgresConfig }) {
  const hasPostgresConfig = Boolean(postgresConfig?.connectionString || postgresConfig?.host);
  if (hasPostgresConfig) {
    const client = new Client(postgresConfig);
    await client.connect();
    const wrapper = new PostgresWrapper(client);
    return { wrapper, client, dialect: 'postgres' };
  }

  const SQL = await initSqlJs();
  const finalDbPath = dbPath || path.join(dataDir, sqliteFileName || 'defterdar-stk.db');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  let sqlDb;
  if (fs.existsSync(finalDbPath)) {
    sqlDb = new SQL.Database(fs.readFileSync(finalDbPath));
  } else {
    sqlDb = new SQL.Database();
  }
  sqlDb.run('PRAGMA foreign_keys = ON');
  const wrapper = new SqliteWrapper(sqlDb);
  return { wrapper, sqlDb, dialect: 'sqlite', dbPath: finalDbPath };
}

module.exports = { createDbManager, normalizeSql };
