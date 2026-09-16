-- Schéma D1 (créé automatiquement par functions/api/[[route]].js ; fourni pour information)
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
