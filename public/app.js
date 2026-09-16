/* Chaîne d'embouteillage — Brasserie du Vénasque
   Application mono-page (vanilla JS). Données via /api (Cloudflare Pages Functions + D1),
   repli en lecture seule sur seed.json si l'API n'est pas disponible. */
(() => {
  'use strict';

  // ---------- Référentiels ----------------------------------------------------
  const L = {
    type: {
      'sav': 'Intervention SAV sur site', 'reparation': 'Réparation', 'commande-pieces': 'Commande pièces / consommables',
      'amelioration': 'Amélioration', 'entretien': 'Entretien interne', 'reglage': 'Réglage / dépannage interne',
      'installation': 'Installation', 'achat': 'Achat matériel', 'projet': 'Devis / projet',
    },
    statutInt: { 'realisee': 'Réalisée', 'planifiee': 'Planifiée', 'en-attente': 'En attente', 'a-completer': 'À compléter', 'abandonnee': 'Abandonnée' },
    source: { 'saisie': 'Saisie équipe', 'mail': 'Mail', 'facture': 'Facture', 'dossier': 'Dossier Butrot', 'memoire': 'De mémoire' },
    gravite: { 'securite': 'Sécurité', 'haute': 'Haute', 'moyenne': 'Moyenne', 'faible': 'Faible' },
    statutInc: { 'ouvert': 'Ouvert', 'en-cours': 'En cours', 'contourne': 'Contourné', 'resolu': 'Résolu' },
    intervenant: ['Butrot', 'Soubeille Air Service', 'Interne', 'Autre'],
  };
  const BADGE = {
    type: { 'sav': 'noir', 'reparation': 'orange', 'commande-pieces': 'bleu', 'amelioration': 'vert', 'entretien': '', 'reglage': 'orange', 'installation': 'vert', 'achat': 'vert', 'projet': '' },
    statutInt: { 'realisee': 'vert', 'planifiee': 'bleu', 'en-attente': 'orange', 'a-completer': '', 'abandonnee': '' },
    gravite: { 'securite': 'securite', 'haute': 'rouge', 'moyenne': 'orange', 'faible': '' },
    statutInc: { 'ouvert': 'rouge', 'en-cours': 'orange', 'contourne': 'orange', 'resolu': 'vert' },
  };
  // Photos de la ligne (septembre 2026) — fichiers dans assets/photos/
  const PHOTOS = [
    { file: 'img_4415.jpg', machine: 'barida', caption: 'Barida ISO 6/1-C : vue d’ensemble, écran Magelis à gauche, capsuleuse à droite' },
    { file: 'img_4416.jpg', machine: 'barida', caption: 'Étoile de remplissage et becs (canules à visser)' },
    { file: 'img_4417.jpg', machine: 'barida', caption: 'Tête de capsulage ISO 6/1-C' },
    { file: 'img_4410.jpg', machine: 'barida', caption: 'Écran Magelis : synoptique convoyeur / capsuleuse (mode automatique) — étiquette « SONDE3 OFF »' },
    { file: 'img_4411.jpg', machine: 'barida', caption: 'Écran Magelis : synoptique cuve et becs (niveaux Max / Med3 / Min, vannes CO2, vide, dégazage)' },
    { file: 'img_4412.jpg', machine: 'barida', caption: 'Détecteur de bouteilles sur le convoyeur d’entrée (33 cl en attente)' },
    { file: 'img_4413.jpg', machine: 'barida', caption: 'Détecteur de bouteilles sur le convoyeur (câble blanc) — photo envoyée à Butrot' },
    { file: 'img_4418.jpg', machine: 'saturateur', caption: 'Saturateur Butrot SBS 2000/12 et son armoire de commande' },
  ];
  const TABS = [
    ['dashboard', 'Tableau de bord'], ['historique', 'Historique'], ['incidents', 'Incidents & SAV'],
    ['pieces', 'Pièces de rechange'], ['consommables', 'Consommables'], ['machines', 'Machines'], ['contacts', 'Contacts & documents'],
  ];

  // ---------- État -------------------------------------------------------------
  const S = {
    data: null, readOnly: false, authRequired: false, tab: localStorage.getItem('emb.tab') || 'dashboard',
    filters: { hist: { machine: '', type: '', annee: '', q: '' }, inc: { statut: 'actifs', machine: '' }, pieces: { q: '', low: false }, conso: { q: '', low: false } },
    openItems: new Set(),
  };

  // ---------- Utilitaires ------------------------------------------------------
  const $ = (sel, root = document) => root.querySelector(sel);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtDate = (d) => { if (!d) return '—'; const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d); return m ? `${m[3]}/${m[2]}/${m[1]}` : d; };
  const fmtEur = (n) => (n == null || n === '' || isNaN(n)) ? '' : new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(n);
  const today = () => new Date().toISOString().slice(0, 10);
  const year = (d) => (d || '').slice(0, 4);
  const machineName = (id) => { const m = (S.data?.machines || []).find((x) => x.id === Number(id)); return m ? m.nom : ''; };
  const SHORT = { barida: 'Barida', enos: 'ENOS', saturateur: 'Saturateur', pompes: 'Pompes', convoyeur: 'Convoyeur', air: 'Air comprimé', filtre: 'Filtre à plaques', enfuteuse: 'Enfûteuse' };
  const machineShort = (id) => { const m = (S.data?.machines || []).find((x) => x.id === Number(id)); if (!m) return ''; return SHORT[m.slug] || m.nom.split(' ').slice(0, 2).join(' '); };
  const badge = (txt, cls = '') => txt ? `<span class="badge ${cls}">${esc(txt)}</span>` : '';
  const isUnknown = (r) => r.stock == null || r.stock === '';
  const isLow = (r) => !isUnknown(r) && Number(r.stock_mini) > 0 && Number(r.stock) < Number(r.stock_mini);

  function toast(msg, err = false) {
    const t = $('#toast'); t.textContent = msg; t.className = 'toast show' + (err ? ' err' : '');
    clearTimeout(toast._t); toast._t = setTimeout(() => (t.className = 'toast'), 2600);
  }

  // ---------- API --------------------------------------------------------------
  const api = {
    async call(path, opts = {}) {
      const res = await fetch('/api/' + path, { credentials: 'same-origin', headers: { 'content-type': 'application/json' }, ...opts });
      let body = null; try { body = await res.json(); } catch (e) { /* vide */ }
      if (res.status === 401) { showLogin(); throw new Error('unauthorized'); }
      if (!res.ok) throw new Error((body && (body.message || body.error)) || ('HTTP ' + res.status));
      return body;
    },
    health: () => fetch('/api/health', { credentials: 'same-origin' }).then((r) => r.json()),
    all: () => api.call('all'),
    create: (t, row) => api.call(t, { method: 'POST', body: JSON.stringify(row) }),
    update: (t, id, row) => api.call(`${t}/${id}`, { method: 'PUT', body: JSON.stringify(row) }),
    remove: (t, id) => api.call(`${t}/${id}`, { method: 'DELETE' }),
    login: (code) => api.call('login', { method: 'POST', body: JSON.stringify({ code }) }),
    logout: () => api.call('logout', { method: 'POST' }),
  };

  async function save(table, row, id = null) {
    if (S.readOnly) { toast('Lecture seule : base non configurée', true); return null; }
    try {
      const saved = id != null ? await api.update(table, id, row) : await api.create(table, row);
      const list = S.data[table];
      const i = list.findIndex((r) => r.id === saved.id);
      if (i >= 0) list[i] = saved; else list.unshift(saved);
      toast(id != null ? 'Modifié ✓' : 'Ajouté ✓');
      render();
      return saved;
    } catch (e) { if (e.message !== 'unauthorized') toast('Erreur : ' + e.message, true); return null; }
  }
  async function remove(table, id) {
    if (S.readOnly) { toast('Lecture seule', true); return; }
    if (!confirm('Supprimer définitivement cette ligne ?')) return;
    try { await api.remove(table, id); S.data[table] = S.data[table].filter((r) => r.id !== id); toast('Supprimé'); render(); }
    catch (e) { toast('Erreur : ' + e.message, true); }
  }

  // ---------- Chargement -------------------------------------------------------
  async function boot() {
    const tag = $('#status-tag');
    let h = null;
    try { h = await api.health(); } catch (e) { h = null; }
    if (!h || !h.db) {
      // Repli : lecture seule sur seed.json
      S.readOnly = true;
      try { S.data = await fetch('seed.json').then((r) => r.json()); } catch (e) { S.data = { machines: [], interventions: [], incidents: [], pieces: [], consommables: [], contacts: [], documents: [] }; }
      tag.textContent = 'Lecture seule'; tag.className = 'tag warn';
      $('#banners').innerHTML = `<div class="banner warn"><span>⚠️</span><div><strong>Base de données non configurée.</strong> L'outil affiche les données de départ (seed.json) en lecture seule. Dans Cloudflare Pages → Settings → Bindings, ajouter une base D1 nommée <code>DB</code>, puis la variable <code>ACCESS_CODE</code>. Voir le README.</div></div>`;
      showApp(); return;
    }
    S.authRequired = h.auth_required;
    if (h.auth_required && !h.authenticated) { showLogin(); return; }
    await loadAll();
  }
  async function loadAll() {
    const tag = $('#status-tag');
    try {
      S.data = await api.all();
      tag.textContent = 'Base connectée'; tag.className = 'tag ok';
      $('#banners').innerHTML = S.authRequired ? '' : `<div class="banner warn"><span>🔓</span><div><strong>Aucun code d'accès configuré :</strong> l'outil est ouvert à quiconque a le lien. Ajouter la variable <code>ACCESS_CODE</code> dans Cloudflare Pages.</div></div>`;
      $('#btn-logout').classList.toggle('hidden', !S.authRequired);
      $('#foot-info').textContent = S.data.meta?.seeded_at ? `données initiales chargées le ${fmtDate(S.data.meta.seeded_at)}` : '';
      showApp();
    } catch (e) {
      if (e.message === 'unauthorized') return;
      tag.textContent = 'Erreur'; tag.className = 'tag err';
      $('#banners').innerHTML = `<div class="banner err"><span>⛔</span><div><strong>Impossible de charger les données :</strong> ${esc(e.message)}</div></div>`;
    }
  }
  function showLogin() { $('#login').classList.remove('hidden'); $('#app').classList.add('hidden'); $('#status-tag').textContent = 'Code requis'; $('#status-tag').className = 'tag warn'; setTimeout(() => $('#login-code').focus(), 50); }
  function showApp() { $('#login').classList.add('hidden'); $('#app').classList.remove('hidden'); render(); }

  $('#login-form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const code = $('#login-code').value.trim(); $('#login-err').textContent = '';
    try { await api.login(code); await loadAll(); }
    catch (e) { $('#login-err').textContent = e.message === 'unauthorized' ? 'Code incorrect' : e.message; }
  });
  $('#btn-logout').addEventListener('click', async () => { await api.logout().catch(() => {}); location.reload(); });
  $('#btn-export').addEventListener('click', () => {
    if (S.readOnly) { const blob = new Blob([JSON.stringify(S.data, null, 2)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'embouteillage-seed.json'; a.click(); return; }
    location.href = '/api/export';
  });

  // ---------- Rendu général ----------------------------------------------------
  function render() {
    renderNav();
    const v = $('#view');
    const fn = { dashboard: viewDashboard, historique: viewHistorique, incidents: viewIncidents, pieces: viewPieces, consommables: viewConso, machines: viewMachines, contacts: viewContacts }[S.tab] || viewDashboard;
    v.innerHTML = fn();
    bindView(v);
  }
  function counts() {
    const d = S.data;
    return {
      incidents: d.incidents.filter((i) => i.statut !== 'resolu').length,
      pieces: d.pieces.filter(isLow).length,
      consommables: d.consommables.filter(isLow).length,
      historique: d.interventions.filter((i) => i.statut === 'en-attente' || i.statut === 'planifiee').length,
    };
  }
  function renderNav() {
    const c = counts();
    $('#nav').innerHTML = TABS.map(([k, lbl]) => `<button data-tab="${k}" class="${S.tab === k ? 'on' : ''}">${lbl}${c[k] ? `<span class="count">${c[k]}</span>` : ''}</button>`).join('');
    $('#nav').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { S.tab = b.dataset.tab; localStorage.setItem('emb.tab', S.tab); render(); window.scrollTo({ top: 0 }); }));
  }
  function bindView(root) {
    root.querySelectorAll('[data-act]').forEach((el) => el.addEventListener('click', (ev) => { ev.stopPropagation(); onAction(el.dataset.act, el.dataset, el); }));
    root.querySelectorAll('.item[data-key]').forEach((el) => el.addEventListener('click', () => { const k = el.dataset.key; if (S.openItems.has(k)) S.openItems.delete(k); else S.openItems.add(k); el.classList.toggle('open'); }));
    root.querySelectorAll('[data-filter]').forEach((el) => el.addEventListener(el.tagName === 'INPUT' && el.type === 'search' ? 'input' : 'change', () => {
      const [group, key] = el.dataset.filter.split('.');
      S.filters[group][key] = el.type === 'checkbox' ? el.checked : el.value;
      if (el.type === 'search') { const pos = el.selectionStart; render(); const n = $(`[data-filter="${el.dataset.filter}"]`); if (n) { n.focus(); n.setSelectionRange(pos, pos); } } else render();
    }));
    root.querySelectorAll('[data-goto]').forEach((el) => el.addEventListener('click', () => { S.tab = el.dataset.goto; localStorage.setItem('emb.tab', S.tab); if (el.dataset.open) S.openItems.add(el.dataset.open); render(); }));
  }

  // ---------- Actions ----------------------------------------------------------
  async function onAction(act, ds) {
    const id = ds.id != null ? Number(ds.id) : null;
    switch (act) {
      case 'add-intervention': return openForm('interventions', { date: today(), machine_id: ds.machine || '', type: 'entretien', intervenant: 'Interne', statut: 'realisee', source: 'saisie' });
      case 'add-incident': return openForm('incidents', { date: today(), machine_id: ds.machine || '', gravite: 'moyenne', statut: 'ouvert' });
      case 'add-piece': return openForm('pieces', { machine_id: ds.machine || '', fournisseur: 'Butrot', stock: 0, stock_mini: 1, unite: 'pièce' });
      case 'add-conso': return openForm('consommables', { fournisseur: 'Butrot', stock: 0, stock_mini: 1 });
      case 'add-machine': return openForm('machines', { actif: 1, annee: new Date().getFullYear() });
      case 'add-contact': return openForm('contacts', { societe: 'Butrot' });
      case 'add-document': return openForm('documents', { date: today(), fournisseur: 'Butrot', type: 'Devis' });
      case 'edit': return openForm(ds.table, S.data[ds.table].find((r) => r.id === id));
      case 'del': return remove(ds.table, id);
      case 'stock': {
        const row = S.data[ds.table].find((r) => r.id === id);
        const n = Math.max(0, Number(row.stock || 0) + Number(ds.delta));
        const saved = await save(ds.table, { stock: n, ...(Number(ds.delta) > 0 ? { dernier_achat: today() } : {}) }, id);
        if (saved && Number(ds.delta) < 0 && isLow(saved)) toast(`Stock sous le minimum : ${saved.designation}`, true);
        return;
      }
      case 'close-incident': {
        const row = S.data.incidents.find((r) => r.id === id);
        return openForm('incidents', { ...row, statut: 'resolu', date_resolution: row.date_resolution || today() });
      }
      case 'copy-order': {
        const txt = $('#order-text').textContent; navigator.clipboard?.writeText(txt).then(() => toast('Liste copiée')); return;
      }
      case 'photo': {
        const ph = PHOTOS.find((p) => p.file === ds.file); if (!ph) return;
        $('#modal').innerHTML = `<h3><span style="font-size:15px;font-family:var(--font-body);text-transform:none;letter-spacing:0">${esc(ph.caption)}</span><button class="btn icon" type="button" id="m-close" aria-label="Fermer">✕</button></h3><img src="assets/photos/${ph.file}" alt="${esc(ph.caption)}" style="width:100%;height:auto;border-radius:10px;display:block">`;
        $('#overlay').classList.add('show'); $('#m-close').onclick = () => $('#overlay').classList.remove('show'); return;
      }
    }
  }

  // ---------- Formulaires ------------------------------------------------------
  const FIELDS = {
    interventions: [
      ['date', 'Date', 'date', { req: true }], ['machine_id', 'Machine', 'machine'],
      ['type', 'Type', 'select', { opts: L.type }], ['intervenant', 'Intervenant', 'datalist', { opts: L.intervenant }],
      ['titre', 'Titre', 'text', { req: true, full: true, ph: 'Ex. : remplacement des joints de snift' }],
      ['description', 'Ce qui a été fait / constaté', 'textarea', { full: true }],
      ['pieces', 'Pièces utilisées ou commandées', 'text', { full: true }],
      ['reference_devis', 'Réf. devis', 'text'], ['reference_facture', 'Réf. facture', 'text'],
      ['montant_ht', 'Montant HT (€)', 'number'], ['statut', 'Statut', 'select', { opts: L.statutInt }],
      ['source', 'Source', 'select', { opts: L.source }], ['notes', 'Notes', 'textarea', { full: true }],
    ],
    incidents: [
      ['date', 'Date', 'date', { req: true }], ['machine_id', 'Machine', 'machine'],
      ['titre', 'Problème', 'text', { req: true, full: true, ph: 'Ex. : la Barida ne monte plus en pression' }],
      ['description', 'Description (symptômes, contexte, photos envoyées…)', 'textarea', { full: true }],
      ['gravite', 'Gravité', 'select', { opts: L.gravite }], ['statut', 'Statut', 'select', { opts: L.statutInc }],
      ['cause', 'Cause identifiée', 'textarea', { full: true }], ['resolution', 'Résolution / solution provisoire', 'textarea', { full: true }],
      ['contact', 'Contact SAV sollicité', 'text'], ['intervention_id', 'N° intervention liée', 'number', { hint: 'Numéro visible dans l’historique' }],
      ['date_resolution', 'Date de résolution', 'date'], ['notes', 'Notes', 'textarea', { full: true }],
    ],
    pieces: [
      ['designation', 'Désignation', 'text', { req: true, full: true }], ['machine_id', 'Machine', 'machine'],
      ['reference', 'Référence fournisseur', 'text'], ['fournisseur', 'Fournisseur', 'text'],
      ['prix_ht', 'Prix unitaire HT (€)', 'number'], ['unite', 'Unité', 'text', { ph: 'pièce, jeu, kit…' }],
      ['stock', 'Stock', 'number', { req: true }], ['stock_mini', 'Stock minimum (alerte)', 'number'],
      ['emplacement', 'Emplacement (rangement)', 'text'], ['dernier_achat', 'Dernier achat', 'date'],
      ['notes', 'Notes', 'textarea', { full: true }],
    ],
    consommables: [
      ['designation', 'Désignation', 'text', { req: true, full: true }], ['usage', 'Usage', 'text', { full: true }],
      ['reference', 'Référence', 'text'], ['fournisseur', 'Fournisseur', 'text'],
      ['unite', 'Unité', 'text', { ph: 'bidon, paquet, bombe…' }], ['prix_ht', 'Prix unitaire HT (€)', 'number'],
      ['stock', 'Stock', 'number', { req: true }], ['stock_mini', 'Stock minimum (alerte)', 'number'],
      ['dernier_achat', 'Dernier achat', 'date'], ['notes', 'Notes', 'textarea', { full: true }],
    ],
    machines: [
      ['nom', 'Nom', 'text', { req: true, full: true }], ['marque', 'Marque / constructeur', 'text'], ['modele', 'Modèle', 'text'],
      ['numero_serie', 'N° de série', 'text'], ['annee', 'Année', 'number'], ['fournisseur', 'Fournisseur', 'text'],
      ['actif', 'En service', 'select', { opts: { 1: 'Oui', 0: 'Non (retirée / vendue)' } }],
      ['description', 'Description', 'textarea', { full: true }], ['notes', 'Notes', 'textarea', { full: true }],
    ],
    contacts: [
      ['societe', 'Société', 'text'], ['nom', 'Nom', 'text', { req: true }], ['role', 'Rôle / pour quoi l’appeler', 'text', { full: true }],
      ['email', 'E-mail', 'text'], ['telephone', 'Téléphone', 'text'], ['notes', 'Notes', 'textarea', { full: true }],
    ],
    documents: [
      ['date', 'Date', 'date'], ['type', 'Type', 'text', { ph: 'Devis, facture, fiche technique…' }], ['reference', 'Référence', 'text'],
      ['fournisseur', 'Fournisseur', 'text'], ['objet', 'Objet', 'text', { full: true, req: true }], ['montant_ht', 'Montant HT (€)', 'number'],
      ['fichier', 'Fichier (où le trouver)', 'text', { full: true }], ['lien', 'Lien (URL)', 'text', { full: true }], ['notes', 'Notes', 'textarea', { full: true }],
    ],
  };
  const TITLES = { interventions: 'Intervention', incidents: 'Incident', pieces: 'Pièce de rechange', consommables: 'Consommable', machines: 'Machine', contacts: 'Contact', documents: 'Document' };

  function openForm(table, row = {}) {
    if (S.readOnly) { toast('Lecture seule : base non configurée', true); return; }
    const isEdit = row.id != null;
    const fields = FIELDS[table];
    const html = fields.map(([k, lbl, kind, o = {}]) => {
      const v = row[k] ?? '';
      let input;
      if (kind === 'machine') input = `<select name="${k}"><option value="">— Toute la chaîne / non précisé —</option>${S.data.machines.map((m) => `<option value="${m.id}" ${Number(v) === m.id ? 'selected' : ''}>${esc(m.nom)}</option>`).join('')}</select>`;
      else if (kind === 'select') input = `<select name="${k}">${Object.entries(o.opts).map(([ov, ol]) => `<option value="${ov}" ${String(v) === String(ov) ? 'selected' : ''}>${esc(ol)}</option>`).join('')}</select>`;
      else if (kind === 'datalist') input = `<input name="${k}" list="dl-${k}" value="${esc(v)}"><datalist id="dl-${k}">${o.opts.map((x) => `<option value="${esc(x)}">`).join('')}</datalist>`;
      else if (kind === 'textarea') input = `<textarea name="${k}">${esc(v)}</textarea>`;
      else input = `<input name="${k}" type="${kind === 'number' ? 'text' : kind}" ${kind === 'number' ? 'inputmode="decimal"' : ''} value="${esc(v)}" placeholder="${esc(o.ph || '')}" ${o.req ? 'required' : ''}>`;
      return `<div class="field ${o.full ? 'full' : ''}"><label>${esc(lbl)}${o.req ? ' *' : ''}</label>${input}${o.hint ? `<div class="hint">${esc(o.hint)}</div>` : ''}</div>`;
    }).join('');
    $('#modal').innerHTML = `<h3><span>${isEdit ? 'Modifier' : 'Ajouter'} · ${TITLES[table]}${isEdit ? ` <span class="muted" style="font-size:13px;font-family:var(--font-body);text-transform:none">n° ${row.id}</span>` : ''}</span><button class="btn icon" type="button" id="m-close" aria-label="Fermer">✕</button></h3>
      <form id="m-form"><div class="form">${html}</div>
      <div class="foot">${isEdit ? `<button type="button" class="btn danger sm" id="m-del">Supprimer</button>` : '<span></span>'}<div class="right"><button type="button" class="btn" id="m-cancel">Annuler</button><button type="submit" class="btn primary">Enregistrer</button></div></div></form>`;
    $('#overlay').classList.add('show');
    const close = () => $('#overlay').classList.remove('show');
    $('#m-close').onclick = close; $('#m-cancel').onclick = close;
    if (isEdit) $('#m-del').onclick = async () => { close(); await remove(table, row.id); };
    $('#m-form').onsubmit = async (ev) => {
      ev.preventDefault();
      const fd = new FormData(ev.target); const out = {};
      for (const [k, lbl, kind] of fields) { let v = fd.get(k); if (v == null) continue; v = String(v).trim(); out[k] = v; }
      const saved = await save(table, out, isEdit ? row.id : null);
      if (saved) close();
    };
    setTimeout(() => { const f = $('#m-form input:not([type=date]), #m-form textarea'); if (!isEdit && f) f.focus(); }, 60);
  }
  $('#overlay').addEventListener('click', (ev) => { if (ev.target.id === 'overlay') $('#overlay').classList.remove('show'); });
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') $('#overlay').classList.remove('show'); });

  // ---------- Vues -------------------------------------------------------------
  function interventionItem(i) {
    const key = 'int' + i.id; const open = S.openItems.has(key);
    const ac = i.statut === 'a-completer';
    return `<div class="item ${open ? 'open' : ''} ${ac ? 'acompleter' : ''}" data-key="${key}">
      <div class="top"><div class="date">${fmtDate(i.date)}</div><div style="flex:1"><div class="title">${esc(i.titre)}</div>
      <div class="badges">${badge(L.type[i.type] || i.type, BADGE.type[i.type])}${badge(machineShort(i.machine_id), 'bleu')}${badge(i.intervenant)}${badge(L.statutInt[i.statut], BADGE.statutInt[i.statut])}${i.montant_ht ? badge(fmtEur(i.montant_ht), 'vert') : ''}</div></div></div>
      <div class="body">${i.description ? `<p>${esc(i.description)}</p>` : ''}
        <dl class="kv">${i.pieces ? `<dt>Pièces</dt><dd>${esc(i.pieces)}</dd>` : ''}${i.reference_devis ? `<dt>Devis</dt><dd>${esc(i.reference_devis)}</dd>` : ''}${i.reference_facture ? `<dt>Facture</dt><dd>${esc(i.reference_facture)}</dd>` : ''}${i.montant_ht ? `<dt>Montant HT</dt><dd>${fmtEur(i.montant_ht)}</dd>` : ''}<dt>Source</dt><dd>${esc(L.source[i.source] || i.source || '—')}</dd>${i.notes ? `<dt>Notes</dt><dd>${esc(i.notes)}</dd>` : ''}<dt>N°</dt><dd>${i.id}</dd></dl>
        <div class="actions"><button class="btn sm" data-act="edit" data-table="interventions" data-id="${i.id}">✎ Modifier</button></div></div></div>`;
  }
  function incidentItem(i) {
    const key = 'inc' + i.id; const open = S.openItems.has(key);
    const linked = i.intervention_id ? S.data.interventions.find((x) => x.id === Number(i.intervention_id)) : null;
    return `<div class="item ${open ? 'open' : ''}" data-key="${key}">
      <div class="top"><div class="date">${fmtDate(i.date)}</div><div style="flex:1"><div class="title">${esc(i.titre)}</div>
      <div class="badges">${badge(L.gravite[i.gravite] || i.gravite, BADGE.gravite[i.gravite])}${badge(L.statutInc[i.statut] || i.statut, BADGE.statutInc[i.statut])}${badge(machineShort(i.machine_id), 'bleu')}${i.contact ? badge(i.contact) : ''}</div></div></div>
      <div class="body">${i.description ? `<p>${esc(i.description)}</p>` : ''}
        <dl class="kv">${i.cause ? `<dt>Cause</dt><dd>${esc(i.cause)}</dd>` : ''}${i.resolution ? `<dt>Résolution</dt><dd>${esc(i.resolution)}</dd>` : ''}${i.contact ? `<dt>Contact SAV</dt><dd>${esc(i.contact)}</dd>` : ''}${linked ? `<dt>Intervention</dt><dd><a href="#" data-goto="historique" data-open="int${linked.id}">n° ${linked.id} · ${esc(linked.titre)}</a></dd>` : ''}${i.date_resolution ? `<dt>Résolu le</dt><dd>${fmtDate(i.date_resolution)}</dd>` : ''}${i.notes ? `<dt>Notes</dt><dd>${esc(i.notes)}</dd>` : ''}</dl>
        <div class="actions"><button class="btn sm" data-act="edit" data-table="incidents" data-id="${i.id}">✎ Modifier</button>${i.statut !== 'resolu' ? `<button class="btn sm primary" data-act="close-incident" data-id="${i.id}">✓ Clore l'incident</button>` : ''}<button class="btn sm" data-act="add-intervention" data-machine="${i.machine_id || ''}">+ Noter une intervention</button></div></div></div>`;
  }

  function viewDashboard() {
    const d = S.data;
    const openInc = d.incidents.filter((i) => i.statut !== 'resolu').sort((a, b) => ['securite', 'haute', 'moyenne', 'faible'].indexOf(a.gravite) - ['securite', 'haute', 'moyenne', 'faible'].indexOf(b.gravite));
    const lowP = d.pieces.filter(isLow), lowC = d.consommables.filter(isLow);
    const unkP = d.pieces.filter(isUnknown).length, unkC = d.consommables.filter(isUnknown).length;
    const pending = d.interventions.filter((i) => i.statut === 'en-attente' || i.statut === 'planifiee');
    const toComplete = d.interventions.filter((i) => i.statut === 'a-completer').length;
    const lastSav = d.interventions.filter((i) => (i.type === 'sav' || i.type === 'reparation') && i.statut === 'realisee').sort((a, b) => b.date.localeCompare(a.date))[0];
    const names = (rows) => rows.slice(0, 3).map((p) => p.designation.split(' (')[0]).join(', ') + (rows.length > 3 ? ` et ${rows.length - 3} autre(s)` : '');
    const alerts = [
      ...openInc.map((i) => `<div class="alert ${i.gravite}" data-goto="incidents" data-open="inc${i.id}"><span class="ico">${i.gravite === 'securite' ? '🛑' : '⚠️'}</span><div><div class="t">${esc(i.titre)}</div><div class="s">${esc(machineShort(i.machine_id))} · ${esc(L.statutInc[i.statut])} · depuis le ${fmtDate(i.date)}</div></div></div>`),
      lowP.length ? `<div class="alert stock" data-goto="pieces"><span class="ico">🔩</span><div><div class="t">${lowP.length} pièce${lowP.length > 1 ? 's' : ''} sous le stock minimum</div><div class="s">${esc(names(lowP))} → liste à commander prête dans « Pièces de rechange »</div></div></div>` : '',
      lowC.length ? `<div class="alert stock" data-goto="consommables"><span class="ico">🧴</span><div><div class="t">${lowC.length} consommable${lowC.length > 1 ? 's' : ''} sous le stock minimum</div><div class="s">${esc(names(lowC))}</div></div></div>` : '',
      ...pending.map((i) => `<div class="alert attente" data-goto="historique" data-open="int${i.id}"><span class="ico">⏳</span><div><div class="t">${esc(i.titre)}</div><div class="s">${esc(L.statutInt[i.statut])} · ${esc(i.intervenant || '')} · ${fmtDate(i.date)}</div></div></div>`),
      (unkP + unkC) ? `<div class="alert faible" data-goto="pieces"><span class="ico">📋</span><div><div class="t">Inventaire à faire : ${unkP} pièce${unkP > 1 ? 's' : ''} et ${unkC} consommable${unkC > 1 ? 's' : ''} sans quantité connue</div><div class="s">Compter ce qu'il y a dans l'armoire et saisir les stocks (bouton ✎ ou + / −) pour activer les alertes de réapprovisionnement.</div></div></div>` : '',
    ].filter(Boolean);
    return `
      <div class="quick">
        <button class="btn primary" data-act="add-incident">🚨 Signaler un problème</button>
        <button class="btn primary" data-act="add-intervention">🔧 Noter une intervention</button>
        <button class="btn" data-goto="pieces">🔩 Sortir / rentrer une pièce</button>
      </div>
      <section class="kpis">
        <div class="kpi" data-goto="incidents"><div class="lbl">Incidents ouverts</div><div class="val ${openInc.length ? 'rouge' : 'vert'}">${openInc.length}</div><div class="sub">${openInc.filter((i) => i.gravite === 'securite').length ? '⚠ dont sécurité' : 'à suivre avec le SAV'}</div></div>
        <div class="kpi" data-goto="pieces"><div class="lbl">Stocks sous le mini</div><div class="val ${lowP.length + lowC.length ? 'orange' : 'vert'}">${lowP.length + lowC.length}</div><div class="sub">${(unkP + unkC) ? `${unkP + unkC} ligne(s) à inventorier` : `${lowP.length} pièce(s) · ${lowC.length} consommable(s)`}</div></div>
        <div class="kpi" data-goto="historique"><div class="lbl">Dernière intervention SAV</div><div class="val" style="font-size:22px">${lastSav ? fmtDate(lastSav.date) : '—'}</div><div class="sub">${lastSav ? esc(lastSav.intervenant + ' · ' + machineShort(lastSav.machine_id)) : ''}</div></div>
        <div class="kpi" data-goto="historique"><div class="lbl">Historique</div><div class="val">${d.interventions.length}</div><div class="sub">${toComplete ? `${toComplete} ligne(s) à compléter (2016-2023)` : 'lignes enregistrées'}</div></div>
      </section>
      <div class="card"><h2><span class="pin"></span>À traiter</h2>
        ${alerts.length ? `<div class="alert-list">${alerts.join('')}</div>` : '<div class="empty">Rien d’urgent : aucun incident ouvert, stocks au-dessus des minimums.</div>'}</div>
      <div class="card"><h2><span class="pin"></span>Les machines<span class="spacer"></span><button class="btn sm" data-goto="machines">Fiches détaillées</button></h2>
        <div class="grid three">${d.machines.filter((m) => m.actif !== 0).map((m) => {
          const last = d.interventions.filter((i) => i.machine_id === m.id && i.statut === 'realisee').sort((a, b) => b.date.localeCompare(a.date))[0];
          const inc = d.incidents.filter((i) => i.machine_id === m.id && i.statut !== 'resolu');
          const low = d.pieces.filter((p) => p.machine_id === m.id && isLow(p)).length;
          return `<div class="machine"><div><div class="name">${esc(m.nom)}</div><div class="model">${esc([m.marque, m.modele].filter(Boolean).join(' · '))}${m.annee ? ` · ${m.annee}` : ''}</div></div>
            <div class="badge-row">${inc.length ? badge(`${inc.length} incident${inc.length > 1 ? 's' : ''}`, inc.some((i) => i.gravite === 'securite') ? 'securite' : 'rouge') : badge('OK', 'vert')}${low ? badge(`${low} pièce${low > 1 ? 's' : ''} à commander`, 'orange') : ''}</div>
            <div class="line"><span>Dernière intervention :</span><b>${last ? `${fmtDate(last.date)} · ${esc(last.titre.length > 48 ? last.titre.slice(0, 46) + '…' : last.titre)}` : '—'}</b></div>
            <div class="actions"><button class="btn sm" data-act="add-incident" data-machine="${m.id}">🚨 Problème</button><button class="btn sm" data-act="add-intervention" data-machine="${m.id}">🔧 Intervention</button></div></div>`;
        }).join('')}</div></div>`;
  }

  function viewHistorique() {
    const f = S.filters.hist; const d = S.data;
    let rows = d.interventions.slice();
    if (f.machine) rows = rows.filter((i) => String(i.machine_id) === f.machine);
    if (f.type) rows = rows.filter((i) => i.type === f.type);
    if (f.annee) rows = rows.filter((i) => year(i.date) === f.annee);
    if (f.q) { const q = f.q.toLowerCase(); rows = rows.filter((i) => [i.titre, i.description, i.pieces, i.reference_devis, i.reference_facture, i.notes, i.intervenant].join(' ').toLowerCase().includes(q)); }
    rows.sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
    const years = [...new Set(d.interventions.map((i) => year(i.date)))].filter(Boolean).sort().reverse();
    const total = rows.reduce((s, i) => s + (Number(i.montant_ht) || 0), 0);
    let html = '', cur = '';
    for (const i of rows) { const y = year(i.date); if (y !== cur) { cur = y; html += `<div class="year">${y}</div>`; } html += interventionItem(i); }
    return `<div class="card"><h2><span class="pin"></span>Historique des interventions<span class="spacer"></span><button class="btn sm primary" data-act="add-intervention">+ Ajouter</button></h2>
      <div class="desc">Tout ce qui est arrivé à la chaîne depuis 2015 : installation, visites SAV Butrot, réparations, commandes de pièces, améliorations. Touchez une ligne pour le détail. Les lignes hachurées sont à compléter de mémoire (aucun mail conservé entre 2016 et 2023).</div>
      <div class="filters"><input type="search" placeholder="Rechercher (titre, pièce, devis…)" value="${esc(f.q)}" data-filter="hist.q">
        <select data-filter="hist.machine"><option value="">Toutes les machines</option>${d.machines.map((m) => `<option value="${m.id}" ${f.machine == m.id ? 'selected' : ''}>${esc(m.nom)}</option>`).join('')}</select>
        <select data-filter="hist.type"><option value="">Tous les types</option>${Object.entries(L.type).map(([k, v]) => `<option value="${k}" ${f.type === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
        <select data-filter="hist.annee"><option value="">Toutes les années</option>${years.map((y) => `<option ${f.annee === y ? 'selected' : ''}>${y}</option>`).join('')}</select></div>
      <div class="muted" style="font-size:12.5px;margin-bottom:6px">${rows.length} ligne(s)${total ? ` · montants renseignés : ${fmtEur(total)} HT` : ''}</div>
      <div class="list">${html || '<div class="empty">Aucune intervention ne correspond.</div>'}</div></div>`;
  }

  function viewIncidents() {
    const f = S.filters.inc; const d = S.data;
    let rows = d.incidents.slice();
    if (f.statut === 'actifs') rows = rows.filter((i) => i.statut !== 'resolu'); else if (f.statut) rows = rows.filter((i) => i.statut === f.statut);
    if (f.machine) rows = rows.filter((i) => String(i.machine_id) === f.machine);
    const order = { ouvert: 0, 'en-cours': 1, contourne: 2, resolu: 3 };
    rows.sort((a, b) => (order[a.statut] ?? 9) - (order[b.statut] ?? 9) || b.date.localeCompare(a.date));
    const butrot = d.contacts.filter((c) => /butrot/i.test(c.societe)).slice(0, 4);
    return `<div class="card"><h2><span class="pin"></span>Incidents & SAV<span class="spacer"></span><button class="btn sm primary" data-act="add-incident">+ Signaler</button></h2>
      <div class="desc">Un incident = un problème technique constaté sur la chaîne. On note le symptôme le jour même, puis la cause, la solution (même provisoire) et qui a été appelé chez Butrot ou Soubeille. On le clôt quand la machine tourne à nouveau normalement.</div>
      <div class="filters"><select data-filter="inc.statut"><option value="actifs" ${f.statut === 'actifs' ? 'selected' : ''}>Ouverts, en cours, contournés</option><option value="" ${f.statut === '' ? 'selected' : ''}>Tous</option>${Object.entries(L.statutInc).map(([k, v]) => `<option value="${k}" ${f.statut === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
        <select data-filter="inc.machine"><option value="">Toutes les machines</option>${d.machines.map((m) => `<option value="${m.id}" ${f.machine == m.id ? 'selected' : ''}>${esc(m.nom)}</option>`).join('')}</select></div>
      <div class="list">${rows.map(incidentItem).join('') || '<div class="empty">Aucun incident dans cette sélection.</div>'}</div></div>
      <div class="card"><h2><span class="pin"></span>Qui appeler chez Butrot ?</h2>
      <div class="desc">Standard <a href="tel:+33228218080">02 28 21 80 80</a> · <a href="mailto:contact@butrot.com">contact@butrot.com</a>. Pour une panne : appeler, puis confirmer par mail avec photos/vidéo, en copie de production@brasserie-du-venasque.com. Butrot envoie un devis estimatif d'intervention (BE) à retourner signé « bon pour accord », puis planifie la visite. Repères tarifaires 2025-2026 : main-d'œuvre 66 à 69 € HT/h facturée au temps passé, forfait déplacement 1 115 € HT (557,50 € si déplacement groupé avec un autre client), hébergement/repas 180 € HT par jour ; compter 1 400 à 2 300 € HT par visite, pièces en sus.</div>
      <div class="grid two">${butrot.map(contactCard).join('')}</div></div>`;
  }

  function stockTable(table, rows, cols) {
    return `<div class="table-wrap"><table><thead><tr>${cols.map((c) => `<th>${c}</th>`).join('')}<th>Stock</th><th></th></tr></thead><tbody>${rows.map((r) => `<tr class="${isLow(r) ? 'low' : ''}">
      <td><b>${esc(r.designation)}</b>${r.reference ? `<span class="small">Réf. ${esc(r.reference)}</span>` : ''}${r.notes ? `<span class="small">${esc(r.notes)}</span>` : ''}</td>
      ${table === 'pieces' ? `<td>${esc(machineShort(r.machine_id) || '—')}</td>` : `<td>${esc(r.usage || '—')}</td>`}
      <td>${esc(r.fournisseur || '—')}${r.prix_ht ? `<span class="small">${fmtEur(r.prix_ht)} HT</span>` : ''}${r.dernier_achat ? `<span class="small">dernier achat ${fmtDate(r.dernier_achat)}</span>` : ''}</td>
      <td class="num"><div class="stock-ctl"><button class="btn icon" data-act="stock" data-table="${table}" data-id="${r.id}" data-delta="-1" title="Sortie d'une unité">−</button><b>${isUnknown(r) ? '?' : Number(r.stock)}</b><button class="btn icon" data-act="stock" data-table="${table}" data-id="${r.id}" data-delta="1" title="Entrée d'une unité">+</button></div><span class="small">${isUnknown(r) ? 'à inventorier · ' : ''}mini ${Number(r.stock_mini) || 0} · ${esc(r.unite || '')}</span></td>
      <td class="num"><button class="btn icon" data-act="edit" data-table="${table}" data-id="${r.id}" title="Modifier">✎</button></td></tr>`).join('')}</tbody></table></div>`;
  }
  function orderList(rows, title) {
    const low = rows.filter(isLow);
    if (!low.length) return '';
    const txt = `Bonjour Maxime,\n\nPourrais-tu nous faire partir les pièces suivantes pour la Brasserie du Vénasque (Montauban-de-Luchon) ?\n\n${low.map((r) => { const q = Math.max(1, Math.ceil((Number(r.stock_mini) || 1) - (Number(r.stock) || 0))); const u = (r.unite || 'pièce').trim(); return `- ${r.designation}${r.reference ? ` (réf. ${r.reference})` : ''} : ${q} ${q > 1 && !/s$/.test(u) ? u + 's' : u}`; }).join('\n')}\n\nMerci par avance,\nBrasserie du Vénasque – 3 rue Sous Baylo, 31110 Montauban-de-Luchon`;
    return `<div class="card"><h2><span class="pin"></span>${title}<span class="spacer"></span><button class="btn sm" data-act="copy-order">📋 Copier le mail</button></h2>
      <div class="desc">Généré à partir des lignes sous le stock minimum. À coller dans un mail à <a href="mailto:maxime.barre@butrot.com">maxime.barre@butrot.com</a> (pièces détachées Butrot), puis à ajuster.</div><pre class="copy" id="order-text">${esc(txt)}</pre></div>`;
  }
  function viewPieces() {
    const f = S.filters.pieces; let rows = S.data.pieces.slice();
    if (f.low) rows = rows.filter(isLow);
    if (f.q) { const q = f.q.toLowerCase(); rows = rows.filter((r) => [r.designation, r.reference, r.fournisseur, r.notes, machineName(r.machine_id)].join(' ').toLowerCase().includes(q)); }
    rows.sort((a, b) => (isLow(b) - isLow(a)) || (a.machine_id || 99) - (b.machine_id || 99) || a.designation.localeCompare(b.designation));
    return `${orderList(S.data.pieces, 'À commander chez Butrot')}<div class="card"><h2><span class="pin"></span>Pièces de rechange<span class="spacer"></span><button class="btn sm primary" data-act="add-piece">+ Ajouter</button></h2>
      <div class="desc">Stock des pièces d'usure et de rechange par machine. Utilisez − quand une pièce est montée sur la machine et + à la réception d'une commande. Les lignes rouges sont sous le minimum. Les quantités de départ sont à inventorier (marquées 0 quand inconnues).</div>
      <div class="filters"><input type="search" placeholder="Rechercher une pièce" value="${esc(f.q)}" data-filter="pieces.q"><label class="btn sm" style="cursor:pointer"><input type="checkbox" data-filter="pieces.low" ${f.low ? 'checked' : ''} style="margin-right:6px">Sous le mini seulement</label></div>
      ${rows.length ? stockTable('pieces', rows, ['Pièce', 'Machine', 'Fournisseur']) : '<div class="empty">Aucune pièce.</div>'}</div>`;
  }
  function viewConso() {
    const f = S.filters.conso; let rows = S.data.consommables.slice();
    if (f.low) rows = rows.filter(isLow);
    if (f.q) { const q = f.q.toLowerCase(); rows = rows.filter((r) => [r.designation, r.reference, r.fournisseur, r.usage, r.notes].join(' ').toLowerCase().includes(q)); }
    rows.sort((a, b) => (isLow(b) - isLow(a)) || a.designation.localeCompare(b.designation));
    return `${orderList(S.data.consommables, 'Consommables à commander')}<div class="card"><h2><span class="pin"></span>Consommables<span class="spacer"></span><button class="btn sm primary" data-act="add-conso">+ Ajouter</button></h2>
      <div class="desc">Huile, glycol, plaques filtrantes, tuyaux, CO2, capsules… tout ce qui se consomme sur la chaîne. Même logique que les pièces : − à l'ouverture d'un bidon ou paquet, + à la réception.</div>
      <div class="filters"><input type="search" placeholder="Rechercher un consommable" value="${esc(f.q)}" data-filter="conso.q"><label class="btn sm" style="cursor:pointer"><input type="checkbox" data-filter="conso.low" ${f.low ? 'checked' : ''} style="margin-right:6px">Sous le mini seulement</label></div>
      ${rows.length ? stockTable('consommables', rows, ['Consommable', 'Usage', 'Fournisseur']) : '<div class="empty">Aucun consommable.</div>'}</div>`;
  }

  function photoStrip(slug) {
    const list = PHOTOS.filter((p) => p.machine === slug);
    if (!list.length) return '';
    return `<div class="photos">${list.map((p) => `<button type="button" class="photo" data-act="photo" data-file="${p.file}" title="${esc(p.caption)}"><img src="assets/photos/${p.file}" alt="${esc(p.caption)}" loading="lazy"></button>`).join('')}</div>`;
  }
  function viewMachines() {
    const d = S.data;
    return `<div class="card"><h2><span class="pin"></span>Photos de la ligne</h2><div class="desc">Prises en septembre 2026. Touchez une photo pour l'agrandir. Pour en ajouter : déposer les fichiers dans <code>public/assets/photos/</code> du dépôt et compléter la liste <code>PHOTOS</code> dans <code>app.js</code>.</div>
      <div class="photos big">${PHOTOS.map((p) => `<button type="button" class="photo" data-act="photo" data-file="${p.file}" title="${esc(p.caption)}"><img src="assets/photos/${p.file}" alt="${esc(p.caption)}" loading="lazy"><span>${esc(p.caption)}</span></button>`).join('')}</div></div>
      <div class="card"><h2><span class="pin"></span>Fiches machines<span class="spacer"></span><button class="btn sm primary" data-act="add-machine">+ Ajouter</button></h2>
      <div class="desc">Chaîne installée par Butrot (Le Landreau, 44) en 2015 : embouteilleuse Barida, saturateur Butrot, étiqueteuse ENOS, pompes, convoyeur, air comprimé. Les fiches reprennent les factures de 2015 et les échanges depuis 2023.</div>
      <div class="list">${d.machines.map((m) => {
        const key = 'mac' + m.id; const open = S.openItems.has(key);
        const ints = d.interventions.filter((i) => i.machine_id === m.id).sort((a, b) => b.date.localeCompare(a.date));
        const incs = d.incidents.filter((i) => i.machine_id === m.id);
        const pcs = d.pieces.filter((p) => p.machine_id === m.id);
        return `<div class="item ${open ? 'open' : ''}" data-key="${key}"><div class="top"><div class="date">${m.annee || ''}</div><div style="flex:1"><div class="title">${esc(m.nom)}</div>
          <div class="badges">${badge([m.marque, m.modele].filter(Boolean).join(' · '))}${m.numero_serie ? badge('n° ' + m.numero_serie, 'bleu') : ''}${m.actif === 0 ? badge('Hors service', 'rouge') : ''}${badge(`${ints.length} intervention${ints.length > 1 ? 's' : ''}`)}${incs.length ? badge(`${incs.length} incident${incs.length > 1 ? 's' : ''}`, 'orange') : ''}${pcs.length ? badge(`${pcs.length} pièce${pcs.length > 1 ? 's' : ''}`) : ''}</div></div></div>
          <div class="body">${m.description ? `<p>${esc(m.description)}</p>` : ''}${photoStrip(m.slug)}<dl class="kv">${m.fournisseur ? `<dt>Fournisseur</dt><dd>${esc(m.fournisseur)}</dd>` : ''}${m.notes ? `<dt>Notes</dt><dd>${esc(m.notes)}</dd>` : ''}${ints.length ? `<dt>Historique</dt><dd>${ints.slice(0, 6).map((i) => `<a href="#" data-goto="historique" data-open="int${i.id}">${fmtDate(i.date)} · ${esc(i.titre)}</a>`).join('<br>')}${ints.length > 6 ? `<br><span class="muted">… et ${ints.length - 6} autre(s) dans l'historique</span>` : ''}</dd>` : ''}</dl>
          <div class="actions"><button class="btn sm" data-act="edit" data-table="machines" data-id="${m.id}">✎ Modifier la fiche</button><button class="btn sm" data-act="add-intervention" data-machine="${m.id}">🔧 Intervention</button><button class="btn sm" data-act="add-incident" data-machine="${m.id}">🚨 Problème</button><button class="btn sm" data-act="add-piece" data-machine="${m.id}">🔩 Pièce</button></div></div></div>`;
      }).join('')}</div></div>`;
  }

  function contactCard(c) {
    const tel = (c.telephone || '').replace(/\s+/g, '');
    return `<div class="contact"><div class="soc">${esc(c.societe || '')}</div><div class="nom">${esc(c.nom)}</div><div class="role">${esc(c.role || '')}</div>
      <div class="links">${c.telephone ? `<a class="btn sm" href="tel:${esc(tel.startsWith('0') ? '+33' + tel.slice(1) : tel)}">📞 ${esc(c.telephone)}</a>` : ''}${c.email ? `<a class="btn sm" href="mailto:${esc(c.email)}">✉ ${esc(c.email)}</a>` : ''}<button class="btn icon sm" data-act="edit" data-table="contacts" data-id="${c.id}" title="Modifier">✎</button></div>
      ${c.notes ? `<div class="notes">${esc(c.notes)}</div>` : ''}</div>`;
  }
  function viewContacts() {
    const d = S.data;
    const groups = {};
    for (const c of d.contacts) (groups[c.societe || 'Autres'] = groups[c.societe || 'Autres'] || []).push(c);
    const docs = d.documents.slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    return `<div class="card"><h2><span class="pin"></span>Contacts SAV & fournisseurs<span class="spacer"></span><button class="btn sm primary" data-act="add-contact">+ Ajouter</button></h2>
      ${Object.entries(groups).map(([soc, list]) => `<div class="year" style="font-size:16px">${esc(soc)}</div><div class="grid two" style="margin-bottom:10px">${list.map(contactCard).join('')}</div>`).join('')}</div>
      <div class="card"><h2><span class="pin"></span>Devis, factures & documents<span class="spacer"></span><button class="btn sm primary" data-act="add-document">+ Ajouter</button></h2>
      <div class="desc">Où retrouver chaque document. Les PDF de 2015 sont dans le dépôt (<code>docs/sources/</code>) et dans le dossier iCloud <em>Brasserie du Vénasque / Fournisseurs / Butrot</em>. Les devis et factures récents sont en pièce jointe des mails indiqués (à archiver dans ce même dossier).</div>
      <div class="table-wrap"><table><thead><tr><th>Date</th><th>Type</th><th>Référence</th><th>Fournisseur</th><th>Objet</th><th>Montant HT</th><th>Fichier</th><th></th></tr></thead><tbody>${docs.map((x) => `<tr><td class="nowrap">${fmtDate(x.date)}</td><td>${esc(x.type || '')}</td><td><b>${esc(x.reference || '')}</b></td><td>${esc(x.fournisseur || '')}</td><td>${esc(x.objet || '')}${x.notes ? `<span class="small">${esc(x.notes)}</span>` : ''}</td><td class="num">${fmtEur(x.montant_ht)}</td><td style="font-size:12px">${x.lien ? `<a href="${esc(x.lien)}" target="_blank" rel="noopener">${esc(x.fichier || 'ouvrir')}</a>` : esc(x.fichier || '')}</td><td class="num"><button class="btn icon" data-act="edit" data-table="documents" data-id="${x.id}">✎</button></td></tr>`).join('')}</tbody></table></div></div>`;
  }

  boot();
})();
