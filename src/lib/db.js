import Database from 'better-sqlite3';
import path from 'path';

let db = null;

export function getDb() {
  if (!db) {
    const dbPath = path.join(process.cwd(), 'data', 'database.sqlite');
    db = new Database(dbPath, { readonly: true });
    db.pragma('journal_mode = WAL');
  }
  return db;
}

/**
 * Execute a read-only SQL query safely.
 * Returns { rows, columns } or throws an error.
 */
export function executeQuery(sql) {
  const database = getDb();

  // Safety: only allow SELECT statements
  const trimmed = sql.trim().toUpperCase();
  if (!trimmed.startsWith('SELECT') && !trimmed.startsWith('WITH')) {
    throw new Error('Only SELECT queries are allowed');
  }

  // Disallow dangerous patterns
  const dangerous = ['DROP', 'DELETE', 'INSERT', 'UPDATE', 'ALTER', 'CREATE', 'ATTACH', 'DETACH'];
  for (const keyword of dangerous) {
    // Check for these as standalone words
    if (new RegExp(`\\b${keyword}\\b`, 'i').test(sql)) {
      throw new Error(`Query contains forbidden keyword: ${keyword}`);
    }
  }

  const stmt = database.prepare(sql);
  const rows = stmt.all();
  const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

  return { rows, columns };
}

/**
 * Get the full database schema for LLM context.
 */
export function getSchema() {
  const database = getDb();
  const tables = database
    .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    .all();

  const schema = [];
  for (const { name } of tables) {
    const info = database.prepare(`PRAGMA table_info("${name}")`).all();
    const count = database.prepare(`SELECT COUNT(*) as cnt FROM "${name}"`).get();
    const sample = database.prepare(`SELECT * FROM "${name}" LIMIT 2`).all();

    schema.push({
      table: name,
      rowCount: count.cnt,
      columns: info.map((col) => ({
        name: col.name,
        type: col.type,
      })),
      sampleRows: sample,
    });
  }
  return schema;
}
