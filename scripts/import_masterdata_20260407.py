#!/usr/bin/env python3
"""
Import Masterdata 20260407 → hrplatform.db
- Aggiorna persone esistenti (inclusi 14 nuovi campi)
- Inserisce 22 nuove persone
- Soft-delete 20 persone assenti dall'Excel
- Aggiorna nodi_organigramma esistenti
- Inserisce 21 nuovi nodi
- Soft-delete 14 nodi assenti dall'Excel
- Scrive change_log per ogni operazione
"""

from __future__ import annotations
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import sqlite3
import openpyxl
from datetime import datetime
from typing import Any, Optional

EXCEL_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                          'Esempi excel', '20260407_esempio per claude.xlsx')
DB_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                       'hrplatform.db')
SHEET = 'Masterdata'
FILE_SOURCE = '20260407_esempio per claude.xlsx'


def v(val: Any) -> str | None:
    """Normalizza valore: None/vuoto → None, altrimenti str.strip()"""
    if val is None:
        return None
    s = str(val).strip()
    return s if s else None


def norm_sesso(s: str | None) -> str | None:
    if not s:
        return None
    s = s.strip()
    if s in ('M', 'Maschile', 'MASCHILE', 'm'):
        return 'M'
    if s in ('F', 'Femminile', 'FEMMINILE', 'f'):
        return 'F'
    return s


def norm_societa(s: str | None) -> str | None:
    if not s:
        return None
    mapping = {
        'Il Sole 24 Ore S.p.A.': 'IL SOLE 24 ORE S.P.A.',
        'il sole 24 ore s.p.a.': 'IL SOLE 24 ORE S.P.A.',
        'IL SOLE 24 ORE S.P.A.': 'IL SOLE 24 ORE S.P.A.',
        'IL SOLE 24 ORE SPA': 'IL SOLE 24 ORE S.P.A.',
        '24 Ore Cultura S.r.l.': '24 ORE CULTURA S.R.L.',
        '24 ore cultura s.r.l.': '24 ORE CULTURA S.R.L.',
        '24 ORE CULTURA S.R.L.': '24 ORE CULTURA S.R.L.',
    }
    return mapping.get(s.strip(), s.strip())


def write_changelog(cur, entity_type, entity_id, entity_label, action,
                    field_name=None, old_value=None, new_value=None):
    cur.execute("""
        INSERT INTO change_log
          (entity_type, entity_id, entity_label, action, field_name, old_value, new_value)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (entity_type, entity_id, entity_label, action, field_name,
          str(old_value) if old_value is not None else None,
          str(new_value) if new_value is not None else None))


def run():
    print(f"Apertura Excel: {EXCEL_PATH}")
    wb = openpyxl.load_workbook(EXCEL_PATH, read_only=True, data_only=True)
    ws = wb[SHEET]
    all_rows = list(ws.iter_rows(values_only=True))
    headers = list(all_rows[0])
    data = all_rows[1:]
    print(f"Lette {len(data)} righe da sheet '{SHEET}'")

    def hi(col_name):
        try:
            return headers.index(col_name)
        except ValueError:
            return None

    # Indici colonne chiave
    cf_idx = hi('TxCodFiscale')
    id_idx = hi('ID')

    print(f"Connessione DB: {DB_PATH}")
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = OFF")
    cur = conn.cursor()

    # Applica migrazioni nuove colonne (idempotenti)
    new_cols = [
        'indirizzo', 'cap', 'citta', 'livello_studio', 'responsabile_diretto',
        'assenza', 'td_sost', 'descrizione_cdc',
        'popolaz_tns', 'deltacdc_tns', 'cdc_new_tns', 'note_appr_tns',
        'escluso_sf', 'popolaz_sf', 'richiedente_sf',
        'ricevente_sf_cognome', 'ricevente_sf_nome', 'ricevente_sf_cf',
    ]
    for col in new_cols:
        try:
            conn.execute(f'ALTER TABLE persone ADD COLUMN {col} TEXT')
        except sqlite3.OperationalError:
            pass  # già esistente

    # ------------------------------------------------------------------ #
    #  PERSONE                                                             #
    # ------------------------------------------------------------------ #

    # Mapping Excel colonna → (db_col, transform_fn)
    PERSONE_COLS = [
        ('TxCodFiscale',       'cf',                    v),
        ('Cognome',            'cognome',               v),
        ('Nome',               'nome',                  v),
        ('Società',            'societa',               norm_societa),
        ('Area',               'area',                  v),
        ('SottoArea',          'sotto_area',            v),
        ('CdcAmministrazione', 'cdc_amministrativo',    v),
        ('Descrizione Cdc',    'descrizione_cdc',       v),
        ('Data-ass',           'data_assunzione',       v),
        ('Data fine rapporto', 'data_fine_rapporto',    v),
        ('Sesso',              'sesso',                 norm_sesso),
        ('Contratto',          'tipo_contratto',        v),
        ('Qualifica',          'qualifica',             v),
        ('Livello',            'livello',               v),
        ('Timb-fir',           'modalita_presenze',     v),
        ('Part-time',          'part_time',             v),
        ('RAL',                'ral',                   v),
        ('Data Nascita',       'data_nascita',          v),
        ('Sede',               'sede',                  v),
        ('email',              'email',                 v),
        ('Indirizzo',          'indirizzo',             v),
        ('CAP',                'cap',                   v),
        ('Città',              'citta',                 v),
        ('Liv-studio',         'livello_studio',        v),
        ('Responsabilediretto','responsabile_diretto',  v),
        ('Assenza',            'assenza',               v),
        ('TD-Sost',            'td_sost',               v),
        # TNS
        ('Escluso da TNS',     'escluso_tns',           v),
        ('CDC_TNS',            'cdc_tns',               v),
        ('Tipo Approvatore TNS','tipo_approvatore',     v),
        ('Titolare_TNS',       'titolare_tns',          v),
        ('LIVELLO_TNS',        'livello_tns',           v),
        ('COD_TNS',            'codice_tns',            v),
        ('PADRE_TNS',          'padre_tns',             v),
        ('RUOLI_OltreV_TNS',   'ruoli_oltrv',           v),
        ('RUOLI',              'ruoli_tns_desc',        v),
        ('Viaggiatore_TNS',    'viaggiatore',           v),
        ('Segr_Redaz_TNS',     'segr_redaz',            v),
        ('Approvatore_TNS',    'approvatore',           v),
        ('Cassiere_TNS',       'cassiere',              v),
        ('Visualizzatori_TNS', 'visualizzatore',        v),
        ('Segretario_TNS',     'segretario',            v),
        ('Controllore_TNS',    'controllore',           v),
        ('Amministrazione_TNS','amministrazione',       v),
        ('SegreteriA_Red_Assta_TNS','segreteria_red_asst', v),
        ('SegretariO_Assto_TNS','segretario_asst',      v),
        ('Controllore_Assto_TNS','controllore_asst',    v),
        ('RuoliAFC',           'ruoli_afc',             v),
        ('RuoliHR',            'ruoli_hr',              v),
        ('AltriRuoli',         'altri_ruoli',           v),
        ('Sede_TNS',           'sede_tns',              v),
        ('GruppoSind',         'gruppo_sind',           v),
        # Nuovi TNS
        ('Popolaz_TNS',        'popolaz_tns',           v),
        ('Deltacdc_TNS',       'deltacdc_tns',          v),
        ('CDC_NEW_TNS',        'cdc_new_tns',           v),
        ('Note Appr NTS',      'note_appr_tns',         v),
        # SuccessFactors
        ('Escluso SF',         'escluso_sf',            v),
        ('Popolazione SF',     'popolaz_sf',            v),
        ('Richiedente SF',     'richiedente_sf',        v),
        ('Ricevente_Cognome',  'ricevente_sf_cognome',  v),
        ('Ricevente_Nome',     'ricevente_sf_nome',     v),
        ('Ricevente_CodFis',   'ricevente_sf_cf',       v),
    ]

    # Pre-calcola indici nel file per performance
    PCOLS = [(hi(exc), db_col, fn) for exc, db_col, fn in PERSONE_COLS if hi(exc) is not None]

    # CF nel DB
    db_persone = {
        row['cf']: dict(row)
        for row in cur.execute('SELECT * FROM persone WHERE deleted_at IS NULL').fetchall()
    }

    # CF nell'Excel
    excel_cfs = set()
    excel_persone_rows = {}  # cf → row
    for row in data:
        cf_raw = row[cf_idx] if cf_idx is not None else None
        cf = v(cf_raw)
        if not cf or len(cf) < 10:  # salta righe senza CF valido
            continue
        excel_cfs.add(cf)
        if cf not in excel_persone_rows:
            excel_persone_rows[cf] = row

    stats = {'p_insert': 0, 'p_update': 0, 'p_skip': 0, 'p_delete': 0,
             'n_insert': 0, 'n_update': 0, 'n_skip': 0, 'n_delete': 0}

    print(f"\n--- PERSONE ---")
    print(f"Excel CF: {len(excel_cfs)}  |  DB: {len(db_persone)}")

    # UPDATE / INSERT persone
    for cf, row in excel_persone_rows.items():
        values = {}
        for idx, db_col, fn in PCOLS:
            values[db_col] = fn(row[idx]) if idx < len(row) else None
        values['cf'] = cf

        existing = db_persone.get(cf)
        label = f"{values.get('cognome','')} {values.get('nome','')}".strip() or cf

        if existing:
            # UPDATE — campo per campo, log solo modifiche
            changed = False
            for db_col, new_val in values.items():
                if db_col == 'cf':
                    continue
                old_val = existing.get(db_col)
                # Normalizza per confronto
                old_s = str(old_val).strip() if old_val is not None else ''
                new_s = str(new_val).strip() if new_val is not None else ''
                if old_s == new_s:
                    continue
                # Non sovrascrivere con vuoto se c'è già un valore
                if new_val is None and old_val is not None:
                    continue
                cur.execute(f'UPDATE persone SET {db_col} = ? WHERE cf = ?', (new_val, cf))
                write_changelog(cur, 'persona', cf, label, 'UPDATE', db_col, old_val, new_val)
                changed = True
            if changed:
                cur.execute('UPDATE persone SET ultimo_aggiornamento = CURRENT_TIMESTAMP WHERE cf = ?', (cf,))
                stats['p_update'] += 1
            else:
                stats['p_skip'] += 1
        else:
            # INSERT nuova persona
            cols = list(values.keys())
            placeholders = ','.join(['?' for _ in cols])
            col_str = ','.join(cols)
            cur.execute(
                f'INSERT OR IGNORE INTO persone ({col_str}) VALUES ({placeholders})',
                [values[c] for c in cols]
            )
            write_changelog(cur, 'persona', cf, label, 'CREATE', None, None,
                            f"Import {FILE_SOURCE}")
            stats['p_insert'] += 1

    # SOFT DELETE persone assenti dall'Excel
    to_delete_p = set(db_persone.keys()) - excel_cfs
    for cf in to_delete_p:
        p = db_persone[cf]
        label = f"{p.get('cognome','')} {p.get('nome','')}".strip() or cf
        cur.execute('UPDATE persone SET deleted_at = CURRENT_TIMESTAMP WHERE cf = ?', (cf,))
        write_changelog(cur, 'persona', cf, label, 'DELETE', None,
                        None, f"Assente da {FILE_SOURCE}")
        stats['p_delete'] += 1

    print(f"Persone → insert:{stats['p_insert']} update:{stats['p_update']} "
          f"skip:{stats['p_skip']} soft-delete:{stats['p_delete']}")

    # ------------------------------------------------------------------ #
    #  NODI ORGANIGRAMMA                                                   #
    # ------------------------------------------------------------------ #

    NODI_COLS = [
        ('ID',                  'id',           v),
        ('ReportsTo',           'reports_to',   v),
        ('TxCodFiscale',        'cf_persona',   v),
        ('Unità Organizzativa', 'nome_uo',      v),
        ('Unità Organizzativa 2','nome_uo_2',   v),
        ('SocietàOrg',          'societa_org',  norm_societa),
        ('Testata GG',          'testata_gg',   v),
        ('CdC',                 'centro_costo', v),
        ('Fte',                 'fte',          v),
        ('Sede',                'sede',         v),
        ('Tipo Collaborazione', 'tipo_collab',  v),
        ('Funzione',            'funzione',     v),
        ('Processo',            'processo',     v),
        ('Note su Unità',       'note_uo',      v),
        ('IncaricoSGSL',        'incarico_sgsl',v),
        ('Job-title',           'job_title',    v),
        ('Testata GG',          'testata_gg',   v),
    ]
    NCOLS = [(hi(exc), db_col, fn) for exc, db_col, fn in NODI_COLS if hi(exc) is not None]
    # Deduplica db_col (Testata GG appare due volte)
    seen = set()
    NCOLS_DEDUP = []
    for item in NCOLS:
        if item[1] not in seen:
            NCOLS_DEDUP.append(item)
            seen.add(item[1])
    NCOLS = NCOLS_DEDUP

    db_nodi = {
        row['id']: dict(row)
        for row in cur.execute('SELECT * FROM nodi_organigramma WHERE deleted_at IS NULL').fetchall()
    }

    excel_ids = set()
    excel_nodi_rows = {}  # id → row
    for row in data:
        nid_raw = row[id_idx] if id_idx is not None else None
        nid = v(nid_raw)
        if not nid:
            continue
        # Normalizza \r\n e \n nei nid
        nid = nid.replace('\r\n', '\n')
        excel_ids.add(nid)
        if nid not in excel_nodi_rows:
            excel_nodi_rows[nid] = row

    print(f"\n--- NODI ---")
    print(f"Excel ID: {len(excel_ids)}  |  DB: {len(db_nodi)}")

    # Normalizza anche gli ID nel DB per il confronto
    db_ids_norm = {}  # id_normalizzato → original_id
    for raw_id in db_nodi:
        norm_id = raw_id.replace('\r\n', '\n').replace('\r', '\n')
        db_ids_norm[norm_id] = raw_id

    for nid, row in excel_nodi_rows.items():
        values = {}
        for idx, db_col, fn in NCOLS:
            values[db_col] = fn(row[idx]) if idx < len(row) else None
        values['id'] = nid

        # Determina tipo_nodo
        cf_val = values.get('cf_persona')
        if cf_val and len(cf_val) >= 10 and cf_val.replace(' ', '').isalnum():
            values['tipo_nodo'] = 'PERSONA'
        else:
            values['tipo_nodo'] = 'STRUTTURA'
            if not cf_val:
                values['cf_persona'] = None

        # Cerca nel DB (normalizzato)
        db_orig_id = db_ids_norm.get(nid)
        existing = db_nodi.get(db_orig_id) if db_orig_id else None

        label = values.get('nome_uo') or nid

        if existing:
            changed = False
            orig_id = existing['id']
            for db_col, new_val in values.items():
                if db_col == 'id':
                    continue
                old_val = existing.get(db_col)
                old_s = str(old_val).strip() if old_val is not None else ''
                new_s = str(new_val).strip() if new_val is not None else ''
                if old_s == new_s:
                    continue
                if new_val is None and old_val is not None:
                    continue
                # fte: confronto numerico
                if db_col == 'fte':
                    try:
                        if abs(float(old_val or 0) - float(new_val or 0)) < 0.001:
                            continue
                    except (ValueError, TypeError):
                        pass
                cur.execute(f'UPDATE nodi_organigramma SET {db_col} = ? WHERE id = ?',
                            (new_val, orig_id))
                write_changelog(cur, 'nodo_org', orig_id, label, 'UPDATE',
                                db_col, old_val, new_val)
                changed = True
            if changed:
                cur.execute('UPDATE nodi_organigramma SET updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                            (orig_id,))
                stats['n_update'] += 1
            else:
                stats['n_skip'] += 1
        else:
            # INSERT nuovo nodo
            cols = list(values.keys())
            placeholders = ','.join(['?' for _ in cols])
            col_str = ','.join(cols)
            cur.execute(
                f'INSERT OR IGNORE INTO nodi_organigramma ({col_str}) VALUES ({placeholders})',
                [values[c] for c in cols]
            )
            write_changelog(cur, 'nodo_org', nid, label, 'CREATE', None, None,
                            f"Import {FILE_SOURCE}")
            stats['n_insert'] += 1

    # SOFT DELETE nodi assenti dall'Excel
    excel_ids_norm = {nid.replace('\r\n', '\n') for nid in excel_ids}
    to_delete_n = [
        orig_id for norm_id, orig_id in db_ids_norm.items()
        if norm_id not in excel_ids_norm
    ]
    for orig_id in to_delete_n:
        n = db_nodi[orig_id]
        label = n.get('nome_uo') or orig_id
        cur.execute('UPDATE nodi_organigramma SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?',
                    (orig_id,))
        write_changelog(cur, 'nodo_org', orig_id, label, 'DELETE', None, None,
                        f"Assente da {FILE_SOURCE}")
        stats['n_delete'] += 1

    print(f"Nodi    → insert:{stats['n_insert']} update:{stats['n_update']} "
          f"skip:{stats['n_skip']} soft-delete:{stats['n_delete']}")

    # ------------------------------------------------------------------ #
    #  Import log globale                                                  #
    # ------------------------------------------------------------------ #
    write_changelog(
        cur, 'system', 'import', FILE_SOURCE, 'IMPORT', None, None,
        f"Masterdata {FILE_SOURCE}: "
        f"persone insert={stats['p_insert']} update={stats['p_update']} delete={stats['p_delete']} | "
        f"nodi insert={stats['n_insert']} update={stats['n_update']} delete={stats['n_delete']}"
    )

    conn.commit()
    conn.execute("PRAGMA foreign_keys = ON")
    conn.close()

    print("\n=== COMPLETATO ===")
    print(f"Persone: +{stats['p_insert']} inserite, ~{stats['p_update']} aggiornate, "
          f"-{stats['p_delete']} soft-delete, ={stats['p_skip']} invariate")
    print(f"Nodi:    +{stats['n_insert']} inseriti, ~{stats['n_update']} aggiornati, "
          f"-{stats['n_delete']} soft-delete, ={stats['n_skip']} invariati")


if __name__ == '__main__':
    run()
