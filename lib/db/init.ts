import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'

let db: Database.Database | null = null

export function getDb(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDb() first.')
  }
  return db
}

export function initDb(): Database.Database {
  if (db) return db

  const dbPath = process.env.DATABASE_PATH ?? path.join(process.cwd(), 'hrplatform.db')
  const dir = path.dirname(dbPath)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

  console.log('[DB] Opening database at:', dbPath)

  db = new Database(dbPath)

  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.pragma('synchronous = NORMAL')

  createSchema(db)

  console.log('[DB] Schema ready')
  return db
}

function createSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS nodi_organigramma (
      id              VARCHAR(200) PRIMARY KEY,
      reports_to      VARCHAR(200) REFERENCES nodi_organigramma(id),
      tipo_nodo       TEXT CHECK(tipo_nodo IN ('STRUTTURA','PERSONA','ANOMALIA')) DEFAULT 'STRUTTURA',
      cf_persona      VARCHAR(16),
      nome_uo         TEXT,
      nome_uo_2       TEXT,
      centro_costo    TEXT,
      fte             REAL,
      job_title       TEXT,
      funzione        TEXT,
      processo        TEXT,
      incarico_sgsl   TEXT,
      societa_org     TEXT,
      testata_gg      TEXT,
      sede            TEXT,
      tipo_collab     TEXT,
      note_uo         TEXT,
      extra_data      TEXT,
      deleted_at      DATETIME,
      created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS persone (
      cf                  VARCHAR(16) PRIMARY KEY,
      cognome             TEXT,
      nome                TEXT,
      data_nascita        TEXT,
      sesso               TEXT,
      email               TEXT,
      societa             TEXT,
      area                TEXT,
      sotto_area          TEXT,
      cdc_amministrativo  TEXT,
      sede                TEXT,
      data_assunzione     TEXT,
      data_fine_rapporto  TEXT,
      tipo_contratto      TEXT,
      qualifica           TEXT,
      livello             TEXT,
      modalita_presenze   TEXT,
      part_time           INTEGER DEFAULT 0,
      ral                 REAL,
      extra_data          TEXT,
      deleted_at          DATETIME,
      ultimo_aggiornamento TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS supervisioni_timesheet (
      cf_dipendente  VARCHAR(16) PRIMARY KEY,
      cf_supervisore VARCHAR(16),
      data_inizio    DATE,
      data_fine      DATE
    );

    CREATE TABLE IF NOT EXISTS ruoli_tns (
      cf_persona        VARCHAR(16) PRIMARY KEY,
      codice_tns        TEXT,
      padre_tns         TEXT,
      livello_tns       TEXT,
      titolare_tns      TEXT,
      tipo_approvatore  TEXT,
      codice_approvatore TEXT,
      viaggiatore       TEXT,
      approvatore       TEXT,
      cassiere          TEXT,
      segretario        TEXT,
      controllore       TEXT,
      amministrazione   TEXT,
      visualizzatore    TEXT,
      escluso_tns       INTEGER DEFAULT 0,
      sede_tns          TEXT
    );

    CREATE TABLE IF NOT EXISTS import_anomalie (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      import_ts   DATETIME DEFAULT CURRENT_TIMESTAMP,
      file_source TEXT,
      riga        INTEGER,
      tipo        VARCHAR(50),
      dettaglio   TEXT
    );

    CREATE TABLE IF NOT EXISTS change_log (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp    DATETIME DEFAULT CURRENT_TIMESTAMP,
      entity_type  TEXT NOT NULL,
      entity_id    TEXT NOT NULL,
      entity_label TEXT,
      action       TEXT NOT NULL,
      field_name   TEXT,
      old_value    TEXT,
      new_value    TEXT
    );

    CREATE TABLE IF NOT EXISTS variabili_org_definizioni (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      nome        TEXT UNIQUE NOT NULL,
      label       TEXT NOT NULL,
      tipo        TEXT CHECK(tipo IN ('TEXT','NUMBER','DATE','BOOLEAN','SELECT')) DEFAULT 'TEXT',
      target      TEXT NOT NULL DEFAULT 'nodo',
      opzioni     TEXT,
      descrizione TEXT,
      ordine      INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS variabili_org_valori (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      entita_tipo TEXT NOT NULL,
      entita_id   TEXT NOT NULL,
      var_id      INTEGER REFERENCES variabili_org_definizioni(id) ON DELETE CASCADE,
      valore      TEXT,
      updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(entita_tipo, entita_id, var_id)
    );

    CREATE INDEX IF NOT EXISTS idx_nodi_reports_to ON nodi_organigramma(reports_to);
    CREATE INDEX IF NOT EXISTS idx_nodi_deleted ON nodi_organigramma(deleted_at);
    CREATE INDEX IF NOT EXISTS idx_nodi_cf_persona ON nodi_organigramma(cf_persona);
    CREATE INDEX IF NOT EXISTS idx_persone_deleted ON persone(deleted_at);
    CREATE INDEX IF NOT EXISTS idx_changelog_timestamp ON change_log(timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_changelog_entity ON change_log(entity_type, entity_id);
    CREATE INDEX IF NOT EXISTS idx_varvalori_entita ON variabili_org_valori(entita_tipo, entita_id);
    CREATE INDEX IF NOT EXISTS idx_varvalori_var ON variabili_org_valori(var_id);

    CREATE TABLE IF NOT EXISTS strutture_tns (
      codice        TEXT PRIMARY KEY,
      nome          TEXT,
      padre         TEXT REFERENCES strutture_tns(codice),
      livello       TEXT,
      tipo          TEXT,
      descrizione   TEXT,
      attivo        INTEGER DEFAULT 1,
      extra_data    TEXT,
      created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_strutture_tns_padre ON strutture_tns(padre);
  `)

  // Migrazioni idempotenti — nuove colonne
  const migrations = [
    'ALTER TABLE persone ADD COLUMN IF NOT EXISTS matricola TEXT',
    'ALTER TABLE ruoli_tns ADD COLUMN IF NOT EXISTS cdc_tns TEXT',
    'ALTER TABLE ruoli_tns ADD COLUMN IF NOT EXISTS ruoli_oltrv TEXT',
    'ALTER TABLE ruoli_tns ADD COLUMN IF NOT EXISTS ruoli TEXT',
    'ALTER TABLE ruoli_tns ADD COLUMN IF NOT EXISTS segr_redaz TEXT',
    'ALTER TABLE ruoli_tns ADD COLUMN IF NOT EXISTS segreteria_red_asst TEXT',
    'ALTER TABLE ruoli_tns ADD COLUMN IF NOT EXISTS segretario_asst TEXT',
    'ALTER TABLE ruoli_tns ADD COLUMN IF NOT EXISTS controllore_asst TEXT',
    'ALTER TABLE ruoli_tns ADD COLUMN IF NOT EXISTS ruoli_afc TEXT',
    'ALTER TABLE ruoli_tns ADD COLUMN IF NOT EXISTS ruoli_hr TEXT',
    'ALTER TABLE ruoli_tns ADD COLUMN IF NOT EXISTS altri_ruoli TEXT',
    'ALTER TABLE ruoli_tns ADD COLUMN IF NOT EXISTS gruppo_sind TEXT',
    'ALTER TABLE strutture_tns ADD COLUMN IF NOT EXISTS cdc TEXT',
    'ALTER TABLE strutture_tns ADD COLUMN IF NOT EXISTS titolare TEXT',
    'ALTER TABLE strutture_tns ADD COLUMN IF NOT EXISTS cf_titolare TEXT',
    'ALTER TABLE strutture_tns ADD COLUMN IF NOT EXISTS sede_tns TEXT',
    'ALTER TABLE strutture_tns ADD COLUMN IF NOT EXISTS viaggiatore TEXT',
    'ALTER TABLE strutture_tns ADD COLUMN IF NOT EXISTS approvatore TEXT',
    'ALTER TABLE strutture_tns ADD COLUMN IF NOT EXISTS cassiere TEXT',
    'ALTER TABLE strutture_tns ADD COLUMN IF NOT EXISTS visualizzatore TEXT',
    'ALTER TABLE strutture_tns ADD COLUMN IF NOT EXISTS segretario TEXT',
    'ALTER TABLE strutture_tns ADD COLUMN IF NOT EXISTS controllore TEXT',
    'ALTER TABLE strutture_tns ADD COLUMN IF NOT EXISTS amministrazione TEXT',
    'ALTER TABLE strutture_tns ADD COLUMN IF NOT EXISTS ruoli_oltrv TEXT',
    'ALTER TABLE strutture_tns ADD COLUMN IF NOT EXISTS ruoli TEXT',
    'ALTER TABLE strutture_tns ADD COLUMN IF NOT EXISTS segr_redaz TEXT',
    'ALTER TABLE strutture_tns ADD COLUMN IF NOT EXISTS segreteria_red_asst TEXT',
    'ALTER TABLE strutture_tns ADD COLUMN IF NOT EXISTS segretario_asst TEXT',
    'ALTER TABLE strutture_tns ADD COLUMN IF NOT EXISTS controllore_asst TEXT',
    'ALTER TABLE strutture_tns ADD COLUMN IF NOT EXISTS ruoli_afc TEXT',
    'ALTER TABLE strutture_tns ADD COLUMN IF NOT EXISTS ruoli_hr TEXT',
    'ALTER TABLE strutture_tns ADD COLUMN IF NOT EXISTS altri_ruoli TEXT',
    'ALTER TABLE strutture_tns ADD COLUMN IF NOT EXISTS gruppo_sind TEXT',
  ]
  for (const sql of migrations) {
    try { db.exec(sql) } catch { /* colonna già esistente */ }
  }
}
