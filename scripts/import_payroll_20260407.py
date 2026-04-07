#!/usr/bin/env python3
"""
Import Payroll Marzo 2026 → hrplatform.db
- Restore tutti i soft-deleted presenti nel payroll
- Insert persone completamente assenti
- Update tutti i campi payroll su persone in comune
- Aggiunge 17 nuove colonne payroll
"""
from __future__ import annotations
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import sqlite3
import openpyxl
from typing import Any, Optional

EXCEL_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                          'Esempi excel', '20260407_esempio per claude.xlsx')
DB_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                       'hrplatform.db')
SHEET = 'payroll'
FILE_SOURCE = 'payroll_20260407'


def v(val: Any) -> Optional[str]:
    if val is None: return None
    s = str(val).strip()
    return s if s else None


def norm_sesso(s):
    if not s: return None
    s = s.strip()
    return 'M' if s in ('M','m','Maschio','MASCHILE') else ('F' if s in ('F','f','Femmina','FEMMINILE') else s)


def norm_societa(s):
    if not s: return None
    s = s.strip()
    MAP = {
        'IL SOLE 24 ORE S.P.A.': 'IL SOLE 24 ORE S.P.A.',
        'IL SOLE 24 ORE SPA': 'IL SOLE 24 ORE S.P.A.',
        '24 ORE CULTURA S.R.L.': '24 ORE CULTURA S.R.L.',
    }
    # match parziale per nomi verbosi come "IL SOLE 24 ORE S.P.A.                   "
    for k, norm in MAP.items():
        if k in s.upper(): return norm
    return s


def norm_email(s):
    if not s: return None
    return s.strip().lower()


def norm_livello(s):
    """Mantieni il codice breve dal payroll (es. 'A', '3', '6Q')"""
    return v(s)


def norm_qualifica(s):
    """Normalizza qualifica dal payroll alla forma canonica del DB"""
    if not s: return None
    s = s.strip()
    MAP = {
        'IMPIEGATO': 'IMPIEGATO', 'IMPIEGATA': 'IMPIEGATO',
        'GIORNALISTA': 'GIORNALISTA',
        'DIRIGENTE': 'DIRIGENTE',
        'COLLABORATORE': 'COLLABORATORE', 'COLLABORATRICE': 'COLLABORATORE',
        'POLIGRAFICO': 'POLIGRAFICO', 'POLIGRAFICA': 'POLIGRAFICO',
        'BORSISTA/STAGE': 'BORSISTA/STAGE', 'STAGE': 'BORSISTA/STAGE',
        'PRATICANTE': 'PRATICANTE',
        'QUADRO': 'QUADRO',
        'C.SOMM': 'C.SOMM.',
        'LAV.PROG': 'Lav.Prog.',
    }
    upper = s.upper()
    for k, norm in MAP.items():
        if upper.startswith(k): return norm
    return s.split()[0] if s else s


def norm_parttime(s):
    """Percentuale part-time come numero"""
    if not s: return None
    try: return str(int(float(s)))
    except: return v(s)


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
    print(f"Lettura payroll: {EXCEL_PATH}")
    wb = openpyxl.load_workbook(EXCEL_PATH, read_only=True, data_only=True)
    ws = wb[SHEET]
    all_rows = list(ws.iter_rows(values_only=True))
    headers = list(all_rows[0])
    data = all_rows[1:]
    print(f"Righe payroll: {len(data)}")

    def hi(col):
        try: return headers.index(col)
        except: return None

    # Indici colonne payroll
    cf_i          = hi('Codice Fiscale')
    cogn_i        = hi('Cognome')
    nome_i        = hi('Nome')
    sesso_i       = hi('Sesso')
    matr_i        = hi('Codice dipendente')   # matricola = codice dipendente
    soc_i         = hi('Azienda')
    cdc_i         = hi('Codice centro di costo')
    desc_cdc_i    = hi('Descrizione centro di costo')
    da_i          = hi('Data assunzione')
    da_gruppo_i   = hi('Data di assunzione nel gruppo')
    dnascita_i    = hi('Data di nascita')
    contratto_i   = hi('Codice contratto')
    desc_contr_i  = hi('Descrizione contratto')
    qualifica_i   = hi('Descrizione qualifica')
    livello_i     = hi('Codice livello')
    email_i       = hi('INDIRIZZO EMAIL')
    sindacato_i   = hi('Sindacato')
    sede_desc_i   = hi('Descrizione sede')
    codice_sede_i = hi('Codice sede')
    comune_i      = hi('Comune sede')
    timb_i        = hi('0005-Timbra/Firma')
    parttime_pct_i= hi('300 - % Ptime')
    cod_pt_i      = hi('Codice part-time')
    dec_pt_i      = hi('Data decorrenza part-time')
    scad_pt_i     = hi('Data scadenza part-time')
    area1_i       = hi('Descrizione struttura - livello 1')
    area2_i       = hi('Descrizione struttura - livello 2')
    area3_i       = hi('Descrizione struttura - livello 3')
    pos_cod_i     = hi('Codice posizione lavorativa')
    pos_desc_i    = hi('Descrizione posizione lavorativa')
    tipo_ct_i     = hi('Tipologia Contratto a Termine')
    scad_ct_i     = hi('Data Scadenza Contratto a Termine')
    cat_prot_i    = hi('Codice categoria protetta')
    desc_cat_i    = hi('Descrizione Categoria Protetta')
    az_prov_i     = hi('Azienda di provenienza')
    tipo_orario_i = hi('Descrizione 0015-Tipo orario')
    sw_tipo_i     = hi('Descrizione tipologia smart working')
    sw_scad_i     = hi('Data scadenza smart working')
    cittad_i      = hi('Cittadinanza')
    resp_i        = hi('Primo responsabile')
    dcesso_i      = hi('Data cessazione')

    def gv(row, i, fn=v):
        if i is None or i >= len(row): return None
        return fn(row[i])

    # ------------------------------------------------------------------ #
    # Leggi payroll
    # ------------------------------------------------------------------ #
    payroll = {}  # cf → dict di campi
    for row in data:
        cf = gv(row, cf_i)
        if not cf or len(cf) < 10: continue
        cf = cf.upper().strip()

        # Matricola = codice dipendente (intero)
        mat = gv(row, matr_i)
        if mat:
            try: mat = str(int(float(mat)))
            except: mat = mat

        # Part-time %
        pt_pct = gv(row, parttime_pct_i)
        if pt_pct:
            try: pt_pct = str(int(float(pt_pct)))
            except: pt_pct = pt_pct

        payroll[cf] = {
            'cognome':              gv(row, cogn_i),
            'nome':                 gv(row, nome_i),
            'sesso':                gv(row, sesso_i, norm_sesso),
            'matricola':            mat,
            'societa':              gv(row, soc_i, norm_societa),
            'cdc_amministrativo':   gv(row, cdc_i),
            'descrizione_cdc':      gv(row, desc_cdc_i),
            'data_assunzione':      gv(row, da_i),
            'data_assunzione_gruppo': gv(row, da_gruppo_i),
            'data_nascita':         gv(row, dnascita_i),
            'tipo_contratto':       gv(row, contratto_i),
            'desc_contratto':       gv(row, desc_contr_i),
            'qualifica':            gv(row, qualifica_i, norm_qualifica),
            'livello':              gv(row, livello_i, norm_livello),
            'email':                gv(row, email_i, norm_email),
            'gruppo_sind':          gv(row, sindacato_i),
            'sede':                 gv(row, sede_desc_i),
            'codice_sede':          gv(row, codice_sede_i),
            'citta':                gv(row, comune_i),
            'modalita_presenze':    gv(row, timb_i),
            'part_time':            pt_pct,
            'codice_parttime':      gv(row, cod_pt_i),
            'data_decorrenza_parttime': gv(row, dec_pt_i),
            'data_scadenza_parttime': gv(row, scad_pt_i),
            'area':                 gv(row, area1_i),
            'sotto_area':           gv(row, area2_i),
            'area_livello3':        gv(row, area3_i),
            'codice_posizione':     gv(row, pos_cod_i),
            'desc_posizione':       gv(row, pos_desc_i),
            'tipo_contratto_termine': gv(row, tipo_ct_i),
            'data_scadenza_ct':     gv(row, scad_ct_i),
            'categoria_protetta':   gv(row, cat_prot_i),
            'azienda_provenienza':  gv(row, az_prov_i),
            'tipo_orario':          gv(row, tipo_orario_i),
            'sw_tipologia':         gv(row, sw_tipo_i),
            'sw_scadenza':          gv(row, sw_scad_i),
            'cittadinanza':         gv(row, cittad_i),
            'responsabile_diretto': gv(row, resp_i),
            'data_fine_rapporto':   gv(row, dcesso_i),
        }

    # ------------------------------------------------------------------ #
    # DB
    # ------------------------------------------------------------------ #
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = OFF")
    cur = conn.cursor()

    # Migrazioni idempotenti nuove colonne payroll
    new_cols = [
        'data_assunzione_gruppo', 'codice_posizione', 'desc_posizione',
        'tipo_contratto_termine', 'data_scadenza_ct', 'codice_parttime',
        'data_decorrenza_parttime', 'data_scadenza_parttime', 'categoria_protetta',
        'azienda_provenienza', 'area_livello3', 'tipo_orario', 'sw_tipologia',
        'sw_scadenza', 'cittadinanza', 'desc_contratto', 'codice_sede',
    ]
    for col in new_cols:
        try: conn.execute(f'ALTER TABLE persone ADD COLUMN {col} TEXT')
        except: pass

    # Tutti i record persone (anche soft-deleted)
    db_all = {r['cf']: dict(r) for r in cur.execute('SELECT * FROM persone').fetchall()}
    db_active = {cf: r for cf, r in db_all.items() if not r.get('deleted_at')}

    stats = {'restore': 0, 'insert': 0, 'update': 0, 'skip': 0}

    # Campi che il payroll sovrascrive sempre (fonte autorevole)
    OVERWRITE_FIELDS = {
        'sesso', 'matricola', 'societa', 'cdc_amministrativo', 'descrizione_cdc',
        'data_assunzione', 'data_assunzione_gruppo', 'data_nascita',
        'tipo_contratto', 'desc_contratto', 'qualifica', 'livello', 'email',
        'gruppo_sind', 'sede', 'codice_sede', 'citta', 'modalita_presenze',
        'part_time', 'codice_parttime', 'data_decorrenza_parttime', 'data_scadenza_parttime',
        'area', 'sotto_area', 'area_livello3', 'codice_posizione', 'desc_posizione',
        'tipo_contratto_termine', 'data_scadenza_ct', 'categoria_protetta',
        'azienda_provenienza', 'tipo_orario', 'sw_tipologia', 'sw_scadenza',
        'cittadinanza', 'responsabile_diretto',
    }
    # data_fine_rapporto: aggiorna solo se il payroll ha un valore
    OVERWRITE_IF_SET = {'data_fine_rapporto'}
    # cognome/nome: aggiorna solo se il DB è vuoto
    FILL_IF_EMPTY = {'cognome', 'nome'}

    for cf, p in payroll.items():
        label = f"{p.get('cognome', '') or ''} {p.get('nome', '') or ''}".strip() or cf
        existing = db_all.get(cf)

        if not existing:
            # INSERT nuovo
            fields = {k: val for k, val in p.items() if val is not None}
            fields['cf'] = cf
            cols = list(fields.keys())
            cur.execute(
                f"INSERT OR IGNORE INTO persone ({','.join(cols)}) VALUES ({','.join(['?']*len(cols))})",
                [fields[c] for c in cols]
            )
            write_changelog(cur, 'persona', cf, label, 'CREATE', None, None,
                            f"Import {FILE_SOURCE}")
            stats['insert'] += 1

        else:
            was_deleted = bool(existing.get('deleted_at'))

            # RESTORE se soft-deleted
            if was_deleted:
                cur.execute('UPDATE persone SET deleted_at = NULL WHERE cf = ?', (cf,))
                write_changelog(cur, 'persona', cf, label, 'RESTORE', None,
                                existing['deleted_at'], None)
                stats['restore'] += 1

            # UPDATE campi
            changed = False
            for db_col, new_val in p.items():
                old_val = existing.get(db_col)
                old_s = str(old_val).strip() if old_val is not None else ''
                new_s = str(new_val).strip() if new_val is not None else ''

                if db_col in OVERWRITE_FIELDS:
                    if new_val is None: continue          # non sovrascrivere con None
                    if old_s == new_s: continue           # uguale, skip
                elif db_col in OVERWRITE_IF_SET:
                    if new_val is None: continue
                    if old_s == new_s: continue
                elif db_col in FILL_IF_EMPTY:
                    if old_s: continue                    # già valorizzato nel DB
                    if new_val is None: continue
                else:
                    continue  # campo non gestito

                cur.execute(f'UPDATE persone SET {db_col} = ? WHERE cf = ?', (new_val, cf))
                write_changelog(cur, 'persona', cf, label, 'UPDATE', db_col, old_val, new_val)
                changed = True

            if changed:
                cur.execute('UPDATE persone SET ultimo_aggiornamento = CURRENT_TIMESTAMP WHERE cf = ?', (cf,))
                if not was_deleted:  # già contato in restore
                    stats['update'] += 1
            elif not was_deleted:
                stats['skip'] += 1

    write_changelog(
        cur, 'system', 'import', FILE_SOURCE, 'IMPORT', None, None,
        f"Payroll {FILE_SOURCE}: restore={stats['restore']} insert={stats['insert']} "
        f"update={stats['update']} skip={stats['skip']}"
    )

    conn.commit()
    conn.execute("PRAGMA foreign_keys = ON")
    conn.close()

    print("\n=== COMPLETATO ===")
    print(f"Restore soft-deleted: {stats['restore']}")
    print(f"Nuovi inseriti:        {stats['insert']}")
    print(f"Aggiornati:            {stats['update']}")
    print(f"Invariati (skip):      {stats['skip']}")


if __name__ == '__main__':
    run()
