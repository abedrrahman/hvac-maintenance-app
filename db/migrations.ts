import * as SQLite from 'expo-sqlite';

const CURRENT_VERSION = 2;

function columnExists(
  db: SQLite.SQLiteDatabase,
  table: string,
  column: string,
): boolean {
  const cols = db.getAllSync<{ name: string }>(`PRAGMA table_info(${table})`);
  return cols.some((c) => c.name === column);
}

function tableExists(db: SQLite.SQLiteDatabase, table: string): boolean {
  const row = db.getFirstSync<{ cnt: number }>(
    "SELECT COUNT(*) as cnt FROM sqlite_master WHERE type='table' AND name=?",
    [table],
  );
  return (row?.cnt ?? 0) > 0;
}

function getSchemaVersion(db: SQLite.SQLiteDatabase): number {
  if (!tableExists(db, 'schema_version')) return 0;
  const row = db.getFirstSync<{ version: number }>(
    'SELECT version FROM schema_version ORDER BY version DESC LIMIT 1',
  );
  return row?.version ?? 0;
}

function setSchemaVersion(db: SQLite.SQLiteDatabase, version: number): void {
  db.runSync('INSERT OR REPLACE INTO schema_version (version) VALUES (?)', [
    version,
  ]);
}

function migrateV1(db: SQLite.SQLiteDatabase): void {
  db.execSync(`
    CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY);

    CREATE TABLE IF NOT EXISTS reports (
      id TEXT PRIMARY KEY NOT NULL,
      type TEXT NOT NULL,
      client TEXT DEFAULT '',
      site TEXT DEFAULT '',
      date TEXT NOT NULL,
      technician TEXT DEFAULT '',
      machine_model TEXT DEFAULT '',
      serial_no TEXT DEFAULT '',
      maintenance_type TEXT DEFAULT 'Preventive',
      status TEXT DEFAULT 'open',
      logo_uri TEXT,
      required_maintenance TEXT DEFAULT '',
      general_notes TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS checklist_items (
      id TEXT PRIMARY KEY NOT NULL,
      report_id TEXT NOT NULL,
      label_en TEXT NOT NULL,
      label_ar TEXT NOT NULL,
      value TEXT DEFAULT '',
      field_key TEXT,
      is_custom INTEGER DEFAULT 0,
      sort_order INTEGER DEFAULT 0,
      FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS attention_notes (
      id TEXT PRIMARY KEY NOT NULL,
      report_id TEXT NOT NULL,
      unit_no TEXT DEFAULT '',
      note TEXT DEFAULT '',
      sort_order INTEGER DEFAULT 0,
      FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS materials (
      id TEXT PRIMARY KEY NOT NULL,
      report_id TEXT NOT NULL,
      description TEXT DEFAULT '',
      qty TEXT DEFAULT '',
      sort_order INTEGER DEFAULT 0,
      FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS photos (
      id TEXT PRIMARY KEY NOT NULL,
      report_id TEXT NOT NULL,
      uri TEXT NOT NULL,
      caption TEXT DEFAULT '',
      sort_order INTEGER DEFAULT 0,
      FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS signatures (
      id TEXT PRIMARY KEY NOT NULL,
      report_id TEXT NOT NULL,
      type TEXT NOT NULL,
      image_base64 TEXT DEFAULT '',
      signer_name TEXT DEFAULT '',
      signed_at TEXT DEFAULT '',
      FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS custom_checklist_templates (
      id TEXT PRIMARY KEY NOT NULL,
      label_en TEXT NOT NULL,
      label_ar TEXT NOT NULL,
      field_type TEXT DEFAULT 'text',
      options TEXT,
      sort_order INTEGER DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_checklist_report ON checklist_items(report_id);
    CREATE INDEX IF NOT EXISTS idx_attention_report ON attention_notes(report_id);
    CREATE INDEX IF NOT EXISTS idx_materials_report ON materials(report_id);
    CREATE INDEX IF NOT EXISTS idx_photos_report ON photos(report_id);
    CREATE INDEX IF NOT EXISTS idx_signatures_report ON signatures(report_id);
  `);
    db.execSync(`
    CREATE INDEX IF NOT EXISTS idx_reports_machine ON reports(machine_id);
  `);
}

function migrateV2(db: SQLite.SQLiteDatabase): void {
  db.execSync(`
    CREATE TABLE IF NOT EXISTS machines (
      id TEXT PRIMARY KEY NOT NULL,
      type TEXT NOT NULL,
      brand TEXT DEFAULT '',
      model TEXT DEFAULT '',
      serial_number TEXT DEFAULT '',
      capacity TEXT DEFAULT '',
      client_name TEXT DEFAULT '',
      site TEXT DEFAULT '',
      location TEXT DEFAULT '',
      installation_year TEXT DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS machine_templates (
      id TEXT PRIMARY KEY NOT NULL,
      machine_id TEXT NOT NULL UNIQUE,
      compressor_count INTEGER DEFAULT 1,
      circuit_count INTEGER DEFAULT 1,
      voltage_types TEXT DEFAULT '[]',
      refrigerant_type TEXT DEFAULT '',
      custom_checklist_rows TEXT DEFAULT '[]',
      default_materials TEXT DEFAULT '[]',
      temp_unit TEXT DEFAULT 'C',
      pressure_unit TEXT DEFAULT 'bar',
      updated_at TEXT NOT NULL,
      FOREIGN KEY (machine_id) REFERENCES machines(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_machines_client ON machines(client_name);
    CREATE INDEX IF NOT EXISTS idx_machines_serial ON machines(serial_number);
    CREATE INDEX IF NOT EXISTS idx_machines_model ON machines(model);
  `);

  if (!columnExists(db, 'reports', 'machine_id')) {
    db.execSync('ALTER TABLE reports ADD COLUMN machine_id TEXT');
  }
  if (!columnExists(db, 'reports', 'temp_unit')) {
    db.execSync("ALTER TABLE reports ADD COLUMN temp_unit TEXT DEFAULT 'C'");
  }
  if (!columnExists(db, 'reports', 'pressure_unit')) {
    db.execSync("ALTER TABLE reports ADD COLUMN pressure_unit TEXT DEFAULT 'bar'");
  }
  if (!columnExists(db, 'materials', 'unit')) {
    db.execSync("ALTER TABLE materials ADD COLUMN unit TEXT DEFAULT ''");
  }
}

export function runMigrations(db: SQLite.SQLiteDatabase): void {
  const version = getSchemaVersion(db);

  if (version < 1) {
    migrateV1(db);
    setSchemaVersion(db, 1);
  }

  if (getSchemaVersion(db) < 2) {
    migrateV2(db);
    setSchemaVersion(db, 2);
  }

  if (getSchemaVersion(db) < CURRENT_VERSION) {
    setSchemaVersion(db, CURRENT_VERSION);
  }
}
