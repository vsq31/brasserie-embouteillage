/**
 * API de l'outil « Chaîne d'embouteillage » — Brasserie du Vénasque
 *
 * Cloudflare Pages Function (catch-all sous /api/*), base Cloudflare D1.
 *
 * Bindings attendus (Cloudflare → Workers & Pages → projet → Settings) :
 *   - D1 database binding  : DB           (base créée dans Workers & Pages → D1)
 *   - Variable d'environnement : ACCESS_CODE (code d'accès partagé de l'équipe)
 *
 * Routes :
 *   GET    /api/health              état (base, code d'accès, session)
 *   POST   /api/login  {code}       ouvre une session (cookie 180 jours)
 *   POST   /api/logout
 *   GET    /api/all                 toutes les tables (crée le schéma et charge seed.json la 1re fois)
 *   GET    /api/export              sauvegarde JSON complète
 *   POST   /api/import  {json}      restaure une sauvegarde (remplace tout)
 *   GET    /api/:table              liste
 *   POST   /api/:table  {champs}    ajoute
 *   PUT    /api/:table/:id {champs} modifie
 *   DELETE /api/:table/:id          supprime
 *
 * Sans binding DB : l'API répond 503 et le site passe en lecture seule (seed.json).
 * Sans ACCESS_CODE : l'API est ouverte (un bandeau le signale dans l'interface).
 */

const TABLES = {
  machines: ['slug', 'nom', 'marque', 'modele', 'numero_serie', 'annee', 'fournisseur', 'description', 'notes', 'actif'],
  interventions: ['date', 'machine_id', 'type', 'intervenant', 'titre', 'description', 'pieces', 'reference_devis', 'reference_facture', 'montant_ht', 'statut', 'source', 'notes'],
  incidents: ['date', 'machine_id', 'titre', 'description', 'gravite', 'statut', 'cause', 'resolution', 'contact', 'intervention_id', 'date_resolution', 'notes'],
  pieces: ['machine_id', 'designation', 'reference', 'fournisseur', 'prix_ht', 'stock', 'stock_mini', 'unite', 'emplacement', 'dernier_achat', 'notes'],
  consommables: ['designation', 'reference', 'fournisseur', 'usage', 'unite', 'stock', 'stock_mini', 'prix_ht', 'dernier_achat', 'notes'],
  contacts: ['societe', 'nom', 'role', 'email', 'telephone', 'notes'],
  documents: ['date', 'type', 'reference', 'fournisseur', 'objet', 'montant_ht', 'fichier', 'lien', 'notes'],
};

const NUMERIC = new Set(['machine_id', 'intervention_id', 'annee', 'montant_ht', 'prix_ht', 'stock', 'stock_mini', 'actif']);

const SCHEMA = `
CREATE TABLE IF NOT EXISTS machines (
  id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT, nom TEXT NOT NULL, marque TEXT, modele TEXT, numero_serie TEXT,
  annee INTEGER, fournisseur TEXT, description TEXT, notes TEXT, actif INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS interventions (
  id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL, machine_id INTEGER, type TEXT, intervenant TEXT,
  titre TEXT NOT NULL, description TEXT, pieces TEXT, reference_devis TEXT, reference_facture TEXT, montant_ht REAL,
  statut TEXT, source TEXT, notes TEXT,
  created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS incidents (
  id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL, machine_id INTEGER, titre TEXT NOT NULL, description TEXT,
  gravite TEXT, statut TEXT, cause TEXT, resolution TEXT, contact TEXT, intervention_id INTEGER, date_resolution TEXT, notes TEXT,
  created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS pieces (
  id INTEGER PRIMARY KEY AUTOINCREMENT, machine_id INTEGER, designation TEXT NOT NULL, reference TEXT, fournisseur TEXT,
  prix_ht REAL, stock REAL DEFAULT 0, stock_mini REAL DEFAULT 0, unite TEXT, emplacement TEXT, dernier_achat TEXT, notes TEXT,
  created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS consommables (
  id INTEGER PRIMARY KEY AUTOINCREMENT, designation TEXT NOT NULL, reference TEXT, fournisseur TEXT, usage TEXT, unite TEXT,
  stock REAL DEFAULT 0, stock_mini REAL DEFAULT 0, prix_ht REAL, dernier_achat TEXT, notes TEXT,
  created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT, societe TEXT, nom TEXT NOT NULL, role TEXT, email TEXT, telephone TEXT, notes TEXT,
  created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT, type TEXT, reference TEXT, fournisseur TEXT, objet TEXT, montant_ht REAL,
  fichier TEXT, lien TEXT, notes TEXT,
  created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
`;

const COOKIE = 'bdv_emb_session';
const enc = new TextEncoder();

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });
}

async function sessionToken(code) {
  const key = await crypto.subtle.importKey('raw', enc.encode(code), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode('brasserie-embouteillage:session:v1'));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function readCookie(request, name) {
  const raw = request.headers.get('cookie') || '';
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

async function isAuthenticated(request, env) {
  if (!env.ACCESS_CODE) return true;
  const expected = await sessionToken(env.ACCESS_CODE);
  const cookie = readCookie(request, COOKIE);
  if (cookie && safeEqual(cookie, expected)) return true;
  const header = request.headers.get('x-access-code');
  if (header && safeEqual(header, env.ACCESS_CODE)) return true;
  return false;
}

let schemaReady = false;
async function ensureSchema(db) {
  if (schemaReady) return;
  const statements = SCHEMA.split(';').map((s) => s.trim()).filter(Boolean);
  await db.batch(statements.map((s) => db.prepare(s)));
  schemaReady = true;
}

function coerce(table, body, { partial = false } = {}) {
  const cols = TABLES[table];
  const out = {};
  for (const c of cols) {
    if (!(c in body)) {
      if (!partial) out[c] = null;
      continue;
    }
    let v = body[c];
    if (v === '' || v === undefined) v = null;
    if (v !== null && NUMERIC.has(c)) {
      const n = Number(String(v).replace(',', '.'));
      v = Number.isFinite(n) ? n : null;
    }
    if (v !== null && typeof v !== 'number') v = String(v);
    out[c] = v;
  }
  return out;
}

async function insertRow(db, table, row, id = null) {
  const cols = Object.keys(row);
  const names = id != null ? ['id', ...cols] : cols;
  const values = id != null ? [id, ...cols.map((c) => row[c])] : cols.map((c) => row[c]);
  const sql = `INSERT INTO ${table} (${names.join(',')}) VALUES (${names.map(() => '?').join(',')})`;
  const res = await db.prepare(sql).bind(...values).run();
  return res.meta.last_row_id;
}

async function seedFromAssets(db, env, request) {
  const url = new URL('/seed.json', request.url);
  const res = await env.ASSETS.fetch(new Request(url.toString()));
  if (!res.ok) throw new Error('seed.json introuvable');
  const seed = await res.json();
  await importAll(db, seed, { keepIds: true });
  await db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('seeded_at', datetime('now')), ('seed_version', ?)")
    .bind(seed.meta?.version || '').run();
}

async function importAll(db, data, { keepIds = true } = {}) {
  for (const table of Object.keys(TABLES)) {
    await db.prepare(`DELETE FROM ${table}`).run();
    const rows = Array.isArray(data[table]) ? data[table] : [];
    for (const r of rows) {
      const row = coerce(table, r);
      await insertRow(db, table, row, keepIds && r.id != null ? r.id : null);
    }
  }
  await db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('imported_at', datetime('now'))").run();
}

async function readAll(db) {
  const out = {};
  for (const table of Object.keys(TABLES)) {
    const order = table === 'interventions' || table === 'incidents' || table === 'documents' ? 'date DESC, id DESC' : 'id ASC';
    const { results } = await db.prepare(`SELECT * FROM ${table} ORDER BY ${order}`).all();
    out[table] = results;
  }
  const { results: meta } = await db.prepare('SELECT key, value FROM meta').all();
  out.meta = Object.fromEntries(meta.map((m) => [m.key, m.value]));
  return out;
}

export async function onRequest(context) {
  const { request, env, params } = context;
  const parts = (params.route || []).filter(Boolean);
  const route = parts[0] || '';
  const id = parts[1] ? Number(parts[1]) : null;
  const method = request.method.toUpperCase();
  const db = env.DB;

  try {
    // --- santé -------------------------------------------------------------
    if (route === 'health') {
      return json({
        ok: true,
        db: !!db,
        auth_required: !!env.ACCESS_CODE,
        authenticated: await isAuthenticated(request, env),
        time: new Date().toISOString(),
      });
    }

    // --- session -----------------------------------------------------------
    if (route === 'login' && method === 'POST') {
      if (!env.ACCESS_CODE) return json({ ok: true, auth_required: false });
      const body = await request.json().catch(() => ({}));
      const code = String(body.code || '').trim();
      if (!code || !safeEqual(code, env.ACCESS_CODE)) return json({ ok: false, error: 'Code d’accès incorrect' }, 401);
      const token = await sessionToken(env.ACCESS_CODE);
      const cookie = `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${180 * 24 * 3600}`;
      return json({ ok: true }, 200, { 'set-cookie': cookie });
    }
    if (route === 'logout' && method === 'POST') {
      return json({ ok: true }, 200, { 'set-cookie': `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0` });
    }

    // --- garde-fous --------------------------------------------------------
    if (!db) return json({ ok: false, error: 'no_db', message: 'Base D1 non configurée (binding « DB »).' }, 503);
    if (!(await isAuthenticated(request, env))) return json({ ok: false, error: 'unauthorized' }, 401);

    await ensureSchema(db);

    // --- tout --------------------------------------------------------------
    if (route === 'all' && method === 'GET') {
      const { count } = await db.prepare('SELECT COUNT(*) AS count FROM machines').first();
      if (count === 0) await seedFromAssets(db, env, request);
      return json(await readAll(db));
    }

    if (route === 'export' && method === 'GET') {
      const data = await readAll(db);
      data.exported_at = new Date().toISOString();
      return json(data, 200, {
        'content-disposition': `attachment; filename="embouteillage-sauvegarde-${new Date().toISOString().slice(0, 10)}.json"`,
      });
    }

    if (route === 'import' && method === 'POST') {
      const data = await request.json();
      if (!data || typeof data !== 'object') return json({ ok: false, error: 'JSON invalide' }, 400);
      await importAll(db, data, { keepIds: true });
      return json({ ok: true });
    }

    if (route === 'reseed' && method === 'POST') {
      await seedFromAssets(db, env, request);
      return json({ ok: true });
    }

    // --- CRUD générique ----------------------------------------------------
    if (!TABLES[route]) return json({ ok: false, error: 'not_found' }, 404);
    const table = route;

    if (method === 'GET') {
      if (id != null) {
        const row = await db.prepare(`SELECT * FROM ${table} WHERE id = ?`).bind(id).first();
        return row ? json(row) : json({ ok: false, error: 'not_found' }, 404);
      }
      const { results } = await db.prepare(`SELECT * FROM ${table} ORDER BY id DESC`).all();
      return json(results);
    }

    if (method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const row = coerce(table, body);
      const newId = await insertRow(db, table, row);
      const created = await db.prepare(`SELECT * FROM ${table} WHERE id = ?`).bind(newId).first();
      return json(created, 201);
    }

    if (method === 'PUT' && id != null) {
      const body = await request.json().catch(() => ({}));
      const row = coerce(table, body, { partial: true });
      const cols = Object.keys(row);
      if (!cols.length) return json({ ok: false, error: 'Aucun champ à modifier' }, 400);
      const sets = cols.map((c) => `${c} = ?`).join(', ');
      await db.prepare(`UPDATE ${table} SET ${sets}, updated_at = datetime('now') WHERE id = ?`)
        .bind(...cols.map((c) => row[c]), id).run();
      const updated = await db.prepare(`SELECT * FROM ${table} WHERE id = ?`).bind(id).first();
      return updated ? json(updated) : json({ ok: false, error: 'not_found' }, 404);
    }

    if (method === 'DELETE' && id != null) {
      await db.prepare(`DELETE FROM ${table} WHERE id = ?`).bind(id).run();
      return json({ ok: true });
    }

    return json({ ok: false, error: 'method_not_allowed' }, 405);
  } catch (err) {
    return json({ ok: false, error: 'server_error', message: String(err && err.message ? err.message : err) }, 500);
  }
}
