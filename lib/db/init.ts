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
    'ALTER TABLE persone ADD COLUMN matricola TEXT',
    'ALTER TABLE ruoli_tns ADD COLUMN cdc_tns TEXT',
    'ALTER TABLE ruoli_tns ADD COLUMN ruoli_oltrv TEXT',
    'ALTER TABLE ruoli_tns ADD COLUMN ruoli TEXT',
    'ALTER TABLE ruoli_tns ADD COLUMN segr_redaz TEXT',
    'ALTER TABLE ruoli_tns ADD COLUMN segreteria_red_asst TEXT',
    'ALTER TABLE ruoli_tns ADD COLUMN segretario_asst TEXT',
    'ALTER TABLE ruoli_tns ADD COLUMN controllore_asst TEXT',
    'ALTER TABLE ruoli_tns ADD COLUMN ruoli_afc TEXT',
    'ALTER TABLE ruoli_tns ADD COLUMN ruoli_hr TEXT',
    'ALTER TABLE ruoli_tns ADD COLUMN altri_ruoli TEXT',
    'ALTER TABLE ruoli_tns ADD COLUMN gruppo_sind TEXT',
    'ALTER TABLE strutture_tns ADD COLUMN cdc TEXT',
    'ALTER TABLE strutture_tns ADD COLUMN titolare TEXT',
    'ALTER TABLE strutture_tns ADD COLUMN cf_titolare TEXT',
    'ALTER TABLE strutture_tns ADD COLUMN sede_tns TEXT',
    'ALTER TABLE strutture_tns ADD COLUMN viaggiatore TEXT',
    'ALTER TABLE strutture_tns ADD COLUMN approvatore TEXT',
    'ALTER TABLE strutture_tns ADD COLUMN cassiere TEXT',
    'ALTER TABLE strutture_tns ADD COLUMN visualizzatore TEXT',
    'ALTER TABLE strutture_tns ADD COLUMN segretario TEXT',
    'ALTER TABLE strutture_tns ADD COLUMN controllore TEXT',
    'ALTER TABLE strutture_tns ADD COLUMN amministrazione TEXT',
    'ALTER TABLE strutture_tns ADD COLUMN ruoli_oltrv TEXT',
    'ALTER TABLE strutture_tns ADD COLUMN ruoli TEXT',
    'ALTER TABLE strutture_tns ADD COLUMN segr_redaz TEXT',
    'ALTER TABLE strutture_tns ADD COLUMN segreteria_red_asst TEXT',
    'ALTER TABLE strutture_tns ADD COLUMN segretario_asst TEXT',
    'ALTER TABLE strutture_tns ADD COLUMN controllore_asst TEXT',
    'ALTER TABLE strutture_tns ADD COLUMN ruoli_afc TEXT',
    'ALTER TABLE strutture_tns ADD COLUMN ruoli_hr TEXT',
    'ALTER TABLE strutture_tns ADD COLUMN altri_ruoli TEXT',
    'ALTER TABLE strutture_tns ADD COLUMN gruppo_sind TEXT',
    // Colonne TNS in persone (fusione ruoli_tns → persone)
    'ALTER TABLE persone ADD COLUMN codice_tns TEXT',
    'ALTER TABLE persone ADD COLUMN padre_tns TEXT',
    'ALTER TABLE persone ADD COLUMN livello_tns TEXT',
    'ALTER TABLE persone ADD COLUMN titolare_tns TEXT',
    'ALTER TABLE persone ADD COLUMN tipo_approvatore TEXT',
    'ALTER TABLE persone ADD COLUMN codice_approvatore TEXT',
    'ALTER TABLE persone ADD COLUMN viaggiatore TEXT',
    'ALTER TABLE persone ADD COLUMN approvatore TEXT',
    'ALTER TABLE persone ADD COLUMN cassiere TEXT',
    'ALTER TABLE persone ADD COLUMN segretario TEXT',
    'ALTER TABLE persone ADD COLUMN controllore TEXT',
    'ALTER TABLE persone ADD COLUMN amministrazione TEXT',
    'ALTER TABLE persone ADD COLUMN visualizzatore TEXT',
    'ALTER TABLE persone ADD COLUMN escluso_tns INTEGER DEFAULT 0',
    'ALTER TABLE persone ADD COLUMN sede_tns TEXT',
    'ALTER TABLE persone ADD COLUMN cdc_tns TEXT',
    'ALTER TABLE persone ADD COLUMN ruoli_oltrv TEXT',
    'ALTER TABLE persone ADD COLUMN ruoli_tns_desc TEXT',
    'ALTER TABLE persone ADD COLUMN segr_redaz TEXT',
    'ALTER TABLE persone ADD COLUMN segreteria_red_asst TEXT',
    'ALTER TABLE persone ADD COLUMN segretario_asst TEXT',
    'ALTER TABLE persone ADD COLUMN controllore_asst TEXT',
    'ALTER TABLE persone ADD COLUMN ruoli_afc TEXT',
    'ALTER TABLE persone ADD COLUMN ruoli_hr TEXT',
    'ALTER TABLE persone ADD COLUMN altri_ruoli TEXT',
    'ALTER TABLE persone ADD COLUMN gruppo_sind TEXT',
    // soft delete strutture_tns
    'ALTER TABLE strutture_tns ADD COLUMN deleted_at DATETIME',
    // index
    'CREATE INDEX IF NOT EXISTS idx_persone_codice_tns ON persone(codice_tns)',
    // Payroll marzo 2026 — nuovi campi
    'ALTER TABLE persone ADD COLUMN data_assunzione_gruppo TEXT',
    'ALTER TABLE persone ADD COLUMN codice_posizione TEXT',
    'ALTER TABLE persone ADD COLUMN desc_posizione TEXT',
    'ALTER TABLE persone ADD COLUMN tipo_contratto_termine TEXT',
    'ALTER TABLE persone ADD COLUMN data_scadenza_ct TEXT',
    'ALTER TABLE persone ADD COLUMN codice_parttime TEXT',
    'ALTER TABLE persone ADD COLUMN data_decorrenza_parttime TEXT',
    'ALTER TABLE persone ADD COLUMN data_scadenza_parttime TEXT',
    'ALTER TABLE persone ADD COLUMN categoria_protetta TEXT',
    'ALTER TABLE persone ADD COLUMN azienda_provenienza TEXT',
    'ALTER TABLE persone ADD COLUMN area_livello3 TEXT',
    'ALTER TABLE persone ADD COLUMN tipo_orario TEXT',
    'ALTER TABLE persone ADD COLUMN sw_tipologia TEXT',
    'ALTER TABLE persone ADD COLUMN sw_scadenza TEXT',
    'ALTER TABLE persone ADD COLUMN cittadinanza TEXT',
    'ALTER TABLE persone ADD COLUMN desc_contratto TEXT',
    'ALTER TABLE persone ADD COLUMN codice_sede TEXT',
    // Masterdata 20260407 — nuovi campi persone
    'ALTER TABLE persone ADD COLUMN indirizzo TEXT',
    'ALTER TABLE persone ADD COLUMN cap TEXT',
    'ALTER TABLE persone ADD COLUMN citta TEXT',
    'ALTER TABLE persone ADD COLUMN livello_studio TEXT',
    'ALTER TABLE persone ADD COLUMN responsabile_diretto TEXT',
    'ALTER TABLE persone ADD COLUMN assenza TEXT',
    'ALTER TABLE persone ADD COLUMN td_sost TEXT',
    'ALTER TABLE persone ADD COLUMN descrizione_cdc TEXT',
    // Masterdata 20260407 — nuovi campi TNS in persone
    'ALTER TABLE persone ADD COLUMN popolaz_tns TEXT',
    'ALTER TABLE persone ADD COLUMN deltacdc_tns TEXT',
    'ALTER TABLE persone ADD COLUMN cdc_new_tns TEXT',
    'ALTER TABLE persone ADD COLUMN note_appr_tns TEXT',
    // Masterdata 20260407 — nuovi campi SuccessFactors in persone
    'ALTER TABLE persone ADD COLUMN escluso_sf TEXT',
    'ALTER TABLE persone ADD COLUMN popolaz_sf TEXT',
    'ALTER TABLE persone ADD COLUMN richiedente_sf TEXT',
    'ALTER TABLE persone ADD COLUMN ricevente_sf_cognome TEXT',
    'ALTER TABLE persone ADD COLUMN ricevente_sf_nome TEXT',
    'ALTER TABLE persone ADD COLUMN ricevente_sf_cf TEXT',
  ]
  for (const sql of migrations) {
    try { db.exec(sql) } catch { /* colonna già esistente */ }
  }

  // === Agent Notifications table ===
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_notifications (
      id              TEXT PRIMARY KEY,
      agent_type      TEXT NOT NULL,
      severity        TEXT NOT NULL CHECK(severity IN ('critical','warning','info','suggestion')),
      title           TEXT NOT NULL,
      body            TEXT NOT NULL,
      entity_type     TEXT,
      entity_id       TEXT,
      proposed_actions TEXT,
      status          TEXT DEFAULT 'unread' CHECK(status IN ('unread','read','actioned','dismissed')),
      created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
      actioned_at     DATETIME,
      actioned_by     TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_agent_notif_status ON agent_notifications(status);
    CREATE INDEX IF NOT EXISTS idx_agent_notif_created ON agent_notifications(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_agent_notif_severity ON agent_notifications(severity);
  `)

  // === Agent Chat Messages table ===
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_chat_messages (
      id          TEXT PRIMARY KEY,
      role        TEXT NOT NULL CHECK(role IN ('user','assistant')),
      content     TEXT NOT NULL,
      metadata    TEXT,
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_chat_created ON agent_chat_messages(created_at);
  `)

  // Data migration idempotente: copia ruoli_tns → persone
  try {
    db.exec(`
      UPDATE persone SET
        codice_tns          = (SELECT codice_tns          FROM ruoli_tns WHERE cf_persona = persone.cf),
        padre_tns           = (SELECT padre_tns           FROM ruoli_tns WHERE cf_persona = persone.cf),
        livello_tns         = (SELECT livello_tns         FROM ruoli_tns WHERE cf_persona = persone.cf),
        titolare_tns        = (SELECT titolare_tns        FROM ruoli_tns WHERE cf_persona = persone.cf),
        tipo_approvatore    = (SELECT tipo_approvatore    FROM ruoli_tns WHERE cf_persona = persone.cf),
        codice_approvatore  = (SELECT codice_approvatore  FROM ruoli_tns WHERE cf_persona = persone.cf),
        viaggiatore         = (SELECT viaggiatore         FROM ruoli_tns WHERE cf_persona = persone.cf),
        approvatore         = (SELECT approvatore         FROM ruoli_tns WHERE cf_persona = persone.cf),
        cassiere            = (SELECT cassiere            FROM ruoli_tns WHERE cf_persona = persone.cf),
        segretario          = (SELECT segretario          FROM ruoli_tns WHERE cf_persona = persone.cf),
        controllore         = (SELECT controllore         FROM ruoli_tns WHERE cf_persona = persone.cf),
        amministrazione     = (SELECT amministrazione     FROM ruoli_tns WHERE cf_persona = persone.cf),
        visualizzatore      = (SELECT visualizzatore      FROM ruoli_tns WHERE cf_persona = persone.cf),
        escluso_tns         = (SELECT escluso_tns         FROM ruoli_tns WHERE cf_persona = persone.cf),
        sede_tns            = (SELECT sede_tns            FROM ruoli_tns WHERE cf_persona = persone.cf),
        cdc_tns             = (SELECT cdc_tns             FROM ruoli_tns WHERE cf_persona = persone.cf),
        ruoli_oltrv         = (SELECT ruoli_oltrv         FROM ruoli_tns WHERE cf_persona = persone.cf),
        ruoli_tns_desc      = (SELECT ruoli               FROM ruoli_tns WHERE cf_persona = persone.cf),
        segr_redaz          = (SELECT segr_redaz          FROM ruoli_tns WHERE cf_persona = persone.cf),
        segreteria_red_asst = (SELECT segreteria_red_asst FROM ruoli_tns WHERE cf_persona = persone.cf),
        segretario_asst     = (SELECT segretario_asst     FROM ruoli_tns WHERE cf_persona = persone.cf),
        controllore_asst    = (SELECT controllore_asst    FROM ruoli_tns WHERE cf_persona = persone.cf),
        ruoli_afc           = (SELECT ruoli_afc           FROM ruoli_tns WHERE cf_persona = persone.cf),
        ruoli_hr            = (SELECT ruoli_hr            FROM ruoli_tns WHERE cf_persona = persone.cf),
        altri_ruoli         = (SELECT altri_ruoli         FROM ruoli_tns WHERE cf_persona = persone.cf),
        gruppo_sind         = (SELECT gruppo_sind         FROM ruoli_tns WHERE cf_persona = persone.cf)
      WHERE codice_tns IS NULL
        AND EXISTS (SELECT 1 FROM ruoli_tns WHERE cf_persona = persone.cf)
    `)
  } catch { /* già migrato o tabella ruoli_tns vuota */ }

  // Normalizzazione valori discreti — idempotente
  try {
    db.exec(`
      UPDATE persone SET sede = 'Milano' WHERE sede IN ('MILANO','milano','MI');
      UPDATE persone SET sede = 'Roma'   WHERE sede IN ('ROMA','roma','RM');
      UPDATE persone SET sede = 'Trento' WHERE sede IN ('TRENTO','trento');
      UPDATE persone SET sede = 'Genova' WHERE sede IN ('GENOVA','genova');
      UPDATE persone SET sede = 'Londra' WHERE sede IN ('LONDRA','londra','London');

      UPDATE nodi_organigramma SET sede = 'Milano' WHERE sede IN ('MILANO','milano','MI');
      UPDATE nodi_organigramma SET sede = 'Roma'   WHERE sede IN ('ROMA','roma','RM');

      UPDATE persone SET sesso = 'M' WHERE sesso IN ('m','male','MALE','uomo','U');
      UPDATE persone SET sesso = 'F' WHERE sesso IN ('f','female','FEMALE','donna','D');

      UPDATE persone SET societa = 'IL SOLE 24 ORE S.P.A.'
        WHERE societa IN ('IL SOLE 24 ORE SPA','Il Sole 24 Ore','IL SOLE 24 ORE','il sole 24 ore s.p.a.');

      UPDATE persone SET qualifica = 'GIORNALISTA'
        WHERE qualifica IN ('Giornalista','GIORNALISTA    G','giornalista');
      UPDATE persone SET qualifica = 'IMPIEGATO'
        WHERE qualifica IN ('Impiegato','IMPIEGATO      I','impiegato');
      UPDATE persone SET qualifica = 'DIRIGENTE'
        WHERE qualifica IN ('Dirigente','dirigente');
      UPDATE persone SET qualifica = 'COLLABORATORE'
        WHERE qualifica IN ('Collaboratore','COLLABORATORE  C','collaboratore');
      UPDATE persone SET qualifica = 'POLIGRAFICO'
        WHERE qualifica IN ('Poligrafico','poligrafico');
    `)
  } catch { /* normalizzazione fallita — ignorata */ }
}
