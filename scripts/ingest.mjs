#!/usr/bin/env node
/**
 * Data Ingestion Script
 * Reads JSONL files from data/sap-o2c-data/ and loads them into SQLite.
 */
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = path.join(__dirname, '..', 'data', 'database.sqlite');

// Remove existing database
if (fs.existsSync(DB_PATH)) {
  fs.unlinkSync(DB_PATH);
}

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = OFF');

/**
 * Convert camelCase to snake_case
 */
function toSnakeCase(str) {
  return str.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '');
}

/**
 * Flatten nested objects (e.g., creationTime: {hours, minutes, seconds} → creation_time)
 */
function flattenRecord(obj, prefix = '') {
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    const snakeKey = prefix ? `${prefix}_${toSnakeCase(key)}` : toSnakeCase(key);
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      // For time objects, combine into a single string
      if ('hours' in value && 'minutes' in value && 'seconds' in value) {
        result[snakeKey] = `${String(value.hours).padStart(2, '0')}:${String(value.minutes).padStart(2, '0')}:${String(value.seconds).padStart(2, '0')}`;
      } else {
        Object.assign(result, flattenRecord(value, snakeKey));
      }
    } else if (typeof value === 'boolean') {
      result[snakeKey] = value ? 1 : 0;
    } else {
      result[snakeKey] = value;
    }
  }
  return result;
}

/**
 * Infer SQL type from a value
 */
function inferType(value) {
  if (value === null || value === undefined) return 'TEXT';
  if (typeof value === 'number') {
    return Number.isInteger(value) ? 'INTEGER' : 'REAL';
  }
  return 'TEXT';
}

/**
 * Process a single entity directory
 */
function processEntity(entityDir) {
  const entityName = path.basename(entityDir);
  const files = fs.readdirSync(entityDir).filter(f => f.endsWith('.jsonl'));

  if (files.length === 0) return;

  // Read all records
  const records = [];
  for (const file of files) {
    const content = fs.readFileSync(path.join(entityDir, file), 'utf-8');
    for (const line of content.trim().split('\n')) {
      if (line.trim()) {
        try {
          const parsed = JSON.parse(line);
          records.push(flattenRecord(parsed));
        } catch (e) {
          console.error(`Error parsing line in ${file}: ${e.message}`);
        }
      }
    }
  }

  if (records.length === 0) return;

  // Collect all column names and types from all records
  const columnMap = new Map();
  for (const record of records) {
    for (const [key, value] of Object.entries(record)) {
      if (!columnMap.has(key)) {
        columnMap.set(key, inferType(value));
      } else if (value !== null && value !== undefined) {
        // Update type if we get a non-null value
        columnMap.set(key, inferType(value));
      }
    }
  }

  // Create table
  const columns = Array.from(columnMap.entries())
    .map(([name, type]) => `"${name}" ${type}`)
    .join(', ');

  const createSQL = `CREATE TABLE IF NOT EXISTS "${entityName}" (${columns})`;
  db.exec(createSQL);

  // Insert records
  const colNames = Array.from(columnMap.keys());
  const placeholders = colNames.map(() => '?').join(', ');
  const insertSQL = `INSERT INTO "${entityName}" (${colNames.map(c => `"${c}"`).join(', ')}) VALUES (${placeholders})`;
  const insert = db.prepare(insertSQL);

  const insertMany = db.transaction((recs) => {
    for (const rec of recs) {
      const values = colNames.map(col => {
        const val = rec[col];
        return val === undefined ? null : val;
      });
      insert.run(...values);
    }
  });

  insertMany(records);
  console.log(`  ✓ ${entityName}: ${records.length} records, ${colNames.length} columns`);
}

// Main
console.log('🔄 Ingesting SAP O2C dataset into SQLite...\n');

const entities = fs.readdirSync(DATA_DIR)
  .filter(d => fs.statSync(path.join(DATA_DIR, d)).isDirectory())
  .sort();

for (const entity of entities) {
  processEntity(path.join(DATA_DIR, entity));
}

// Create useful indexes
console.log('\n📇 Creating indexes...');
const indexes = [
  'CREATE INDEX IF NOT EXISTS idx_soh_sales_order ON sales_order_headers(sales_order)',
  'CREATE INDEX IF NOT EXISTS idx_soh_sold_to ON sales_order_headers(sold_to_party)',
  'CREATE INDEX IF NOT EXISTS idx_soi_sales_order ON sales_order_items(sales_order)',
  'CREATE INDEX IF NOT EXISTS idx_soi_material ON sales_order_items(material)',
  'CREATE INDEX IF NOT EXISTS idx_sosl_sales_order ON sales_order_schedule_lines(sales_order)',
  'CREATE INDEX IF NOT EXISTS idx_odh_delivery ON outbound_delivery_headers(delivery_document)',
  'CREATE INDEX IF NOT EXISTS idx_odi_delivery ON outbound_delivery_items(delivery_document)',
  'CREATE INDEX IF NOT EXISTS idx_odi_ref_sd ON outbound_delivery_items(reference_sd_document)',
  'CREATE INDEX IF NOT EXISTS idx_bdh_billing ON billing_document_headers(billing_document)',
  'CREATE INDEX IF NOT EXISTS idx_bdh_sold_to ON billing_document_headers(sold_to_party)',
  'CREATE INDEX IF NOT EXISTS idx_bdh_acct_doc ON billing_document_headers(accounting_document)',
  'CREATE INDEX IF NOT EXISTS idx_bdi_billing ON billing_document_items(billing_document)',
  'CREATE INDEX IF NOT EXISTS idx_bdi_ref_sd ON billing_document_items(reference_sd_document)',
  'CREATE INDEX IF NOT EXISTS idx_bdc_billing ON billing_document_cancellations(billing_document)',
  'CREATE INDEX IF NOT EXISTS idx_je_acct_doc ON journal_entry_items_accounts_receivable(accounting_document)',
  'CREATE INDEX IF NOT EXISTS idx_je_customer ON journal_entry_items_accounts_receivable(customer)',
  'CREATE INDEX IF NOT EXISTS idx_pay_acct_doc ON payments_accounts_receivable(accounting_document)',
  'CREATE INDEX IF NOT EXISTS idx_pay_customer ON payments_accounts_receivable(customer)',
  'CREATE INDEX IF NOT EXISTS idx_prod_product ON products(product)',
  'CREATE INDEX IF NOT EXISTS idx_pd_product ON product_descriptions(product)',
  'CREATE INDEX IF NOT EXISTS idx_pp_product ON product_plants(product)',
  'CREATE INDEX IF NOT EXISTS idx_pp_plant ON product_plants(plant)',
  'CREATE INDEX IF NOT EXISTS idx_pl_plant ON plants(plant)',
  'CREATE INDEX IF NOT EXISTS idx_bp_bp ON business_partners(business_partner)',
  'CREATE INDEX IF NOT EXISTS idx_bp_customer ON business_partners(customer)',
  'CREATE INDEX IF NOT EXISTS idx_bpa_bp ON business_partner_addresses(business_partner)',
  'CREATE INDEX IF NOT EXISTS idx_csa_customer ON customer_sales_area_assignments(customer)',
  'CREATE INDEX IF NOT EXISTS idx_cca_customer ON customer_company_assignments(customer)',
];

for (const idx of indexes) {
  db.exec(idx);
}

console.log('✅ Ingestion complete!\n');

// Print summary
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
for (const { name } of tables) {
  const count = db.prepare(`SELECT COUNT(*) as cnt FROM "${name}"`).get();
  console.log(`  ${name}: ${count.cnt} records`);
}

db.close();
