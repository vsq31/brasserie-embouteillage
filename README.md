# Chaîne d'embouteillage — Brasserie du Vénasque

Outil interne de suivi de la chaîne d'embouteillage installée par Butrot en 2015 (embouteilleuse Barida ISO 6-1/C-A, étiqueteuse ENOS Euro Compatta, saturateur Butrot SBS 2000/12, pompes, convoyeur, air comprimé) : historique des interventions, incidents et SAV, pièces de rechange, consommables, contacts et documents. Pensé pour être rempli à l'atelier sur téléphone par Jérôme, Baptiste et Arnaud.

- **Site** : Cloudflare Pages (dossier `public/`), même charte que `brasserie-dashboard`.
- **Données** : base Cloudflare D1 (SQLite hébergé), via les Pages Functions de `functions/api/`.
- **Accès** : un code partagé (`ACCESS_CODE`), session de 180 jours sur chaque appareil.
- **Données de départ** : `public/seed.json`, reconstituées le 16/09/2026 à partir des factures 2015 et des mails Butrot / Soubeille (chargées automatiquement au premier appel de l'API).
- **Documentation** : `docs/synthese-historique-butrot.md` (synthèse 2015 → 2026), `docs/echanges-butrot-gmail.md` (export des mails), `docs/sources/` (factures et fiches techniques 2015).

## Mise en ligne (une fois, ~10 minutes)

1. **Cloudflare → Workers & Pages → Create → Pages → Connect to Git**, choisir le dépôt `vsq31/brasserie-embouteillage`.
   - Framework preset : *None* · Build command : *(vide)* · Build output directory : `public`.
   - Déployer. Le site est en ligne mais en **lecture seule** (bandeau orange) tant que la base n'est pas liée.
2. **Créer la base** : Workers & Pages → **D1 SQL Database** → *Create database* → nom `brasserie-embouteillage` (région Western Europe).
3. **Lier la base au projet Pages** : projet → *Settings* → *Bindings* → *Add* → **D1 database** → Variable name `DB` → base `brasserie-embouteillage`. (Pour l'environnement *Production* ; répéter pour *Preview* si besoin.)
4. **Code d'accès** : projet → *Settings* → *Variables and Secrets* → *Add* → nom `ACCESS_CODE`, valeur = le code choisi pour l'équipe (type *Secret* de préférence).
5. **Redéployer** : *Deployments* → dernier déploiement → *Retry deployment* (les bindings ne s'appliquent qu'aux déploiements suivants).
6. Ouvrir le site, entrer le code : les tables sont créées et remplies avec `seed.json` automatiquement. Le bandeau « Base connectée » s'affiche en haut à droite.

Aucun schéma SQL à exécuter à la main : `functions/api/[[route]].js` crée les tables (`CREATE TABLE IF NOT EXISTS`) et charge les données de départ si la table `machines` est vide. Le fichier `schema.sql` est fourni pour information.

## Utilisation

- **Tableau de bord** : incidents ouverts (sécurité en rouge), stocks sous le minimum, demandes en attente chez le fournisseur, dernière intervention par machine ; boutons *Signaler un problème* / *Noter une intervention*.
- **Historique** : toute la vie de la chaîne depuis 2015, filtrable par machine, type, année ; les lignes hachurées « à compléter » couvrent 2016-2023 (aucun mail conservé) — à remplir de mémoire.
- **Incidents & SAV** : symptôme → cause → résolution → qui a été appelé ; bouton *Clore l'incident*.
- **Pièces de rechange / Consommables** : stock avec boutons − / + (sortie / réception) ; les lignes rouges sont sous le minimum ; une liste « à commander » prête à coller dans un mail à Maxime Barré est générée automatiquement. Les quantités marquées `?` sont à inventorier.
- **Machines** : fiche de chaque équipement (prix 2015, caractéristiques, historique).
- **Contacts & documents** : qui appeler chez Butrot / Soubeille, et où retrouver chaque devis ou facture.
- **Sauvegarde** : bouton en haut à droite → fichier JSON complet. Pour restaurer : `POST /api/import` avec ce JSON (ou demander à Claude).

## Développement local

```bash
npm install --no-save wrangler
npx wrangler pages dev public --d1 DB=brasserie-embouteillage --binding ACCESS_CODE=venasque
# → http://127.0.0.1:8788 (base D1 locale créée dans .wrangler/, code « venasque »)
```

## API (Pages Functions)

| Méthode | Route | Rôle |
|---|---|---|
| GET | `/api/health` | état : base liée ? code requis ? session ouverte ? |
| POST | `/api/login` `{code}` | ouvre la session (cookie HttpOnly 180 jours) |
| POST | `/api/logout` | ferme la session |
| GET | `/api/all` | toutes les tables (+ création du schéma et chargement de `seed.json` au premier appel) |
| GET | `/api/export` | sauvegarde JSON téléchargeable |
| POST | `/api/import` | restaure une sauvegarde (remplace tout) |
| POST | `/api/reseed` | recharge `seed.json` (remplace tout) |
| GET / POST | `/api/{table}` | liste / ajoute |
| PUT / DELETE | `/api/{table}/{id}` | modifie / supprime |

Tables : `machines`, `interventions`, `incidents`, `pieces`, `consommables`, `contacts`, `documents` (colonnes dans `schema.sql`). Les appels autres que `health` et `login` exigent la session (ou l'en-tête `X-Access-Code`).

## Évolutions possibles

Rappels d'entretien périodiques (graissage snifts, filtres air), photos jointes aux incidents (Cloudflare R2), envoi direct du mail de commande à Butrot, page dans la navigation commune du dashboard.
