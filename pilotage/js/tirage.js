/* tirage.js — choix des éléments de l'échauffement (logique pure, reproductible).
   Entrées : journal, banques de classe (classe.json) par UAA, index du cours en cours, classe, jour, graine.
   Même entrée + même graine = même résultat. Règles : README.md, « Règles de tirage ». */
(function (root, fabrique) {
  var m = fabrique(typeof require === "function" ? require("./outils.js") : root.Pilotage.outils,
                   typeof require === "function" ? require("./ev.js") : root.Pilotage.ev);
  if (typeof module === "object" && module.exports) module.exports = m;
  else { root.Pilotage = root.Pilotage || {}; root.Pilotage.tirage = m; }
})(typeof window !== "undefined" ? window : this, function (O, E) {
  "use strict";
  var CIBLE = 3;               // éléments proposés
  var FACTEUR_REPRENDRE = 4;   // poids d'un élément « à reprendre » (révision espacée)
  var FACTEUR_RECENT = 0.05;   // poids d'un élément posé lors de l'échauffement précédent

  function qcmEch(banque, role) {
    return ((banque && banque.qcm) || []).filter(function (q) { return q.usage === "echauffement" && (!role || q.role === role); });
  }
  function itemQcm(q, slot, uaa, raison) {
    return { slot: slot, kind: "qcm", id: q.id, role: q.role || null, uaa: uaa, apercu: O.apercu(q.enonce), raison: raison };
  }

  // params : { classe:{code,niveau}, uaa, banques:{uaa:classe.json}, index (indexcours.creer), ev, fuseau,
  //            jour (AAAA-MM-JJ), graine (texte), rempl:{slot:{n,exclus:[ids]}}, exercice: true|false|undefined }
  function tirer(p) {
    var fuseau = p.fuseau, code = p.classe.code, uaa = p.uaa;
    var etat = E.etat(p.ev, code, fuseau);
    var vues = E.uaasVues(etat);
    var poses = E.poses(p.ev, code), reprendre = E.aReprendre(p.ev, code);
    var histo = E.echauffements(p.ev, code, fuseau), dernierEch = histo.length ? histo[histo.length - 1] : null;
    var recent = {};
    if (dernierEch) dernierEch.items.forEach(function (it) { if (it && it.id) recent[it.id] = 1; });
    var rempl = p.rempl || {}, base = (p.graine || (code + "|" + p.jour)), choisis = {}, items = [], notes = [];
    var banque = (p.banques || {})[uaa] || null, index = p.index;

    function rng(slot) { return O.generateur(base + "|" + slot + "|" + ((rempl[slot] && rempl[slot].n) || 0)); }
    function exclus(slot) { var s = {}; ((rempl[slot] && rempl[slot].exclus) || []).forEach(function (x) { s[x] = 1; }); return s; }
    // Poids : moins une question a été posée, plus elle est probable. Un élément « à reprendre » (révision
    // espacée) ignore ce malus et pèse FACTEUR_REPRENDRE ; posé lors du dernier échauffement, il pèse 4 fois moins.
    function poids(q, slot, aussiReprendre) {
      if (aussiReprendre && reprendre[q.id]) return FACTEUR_REPRENDRE * (recent[q.id] ? 0.25 : 1);
      var w = 1 / Math.pow(1 + (poses[q.id] || 0), 2);
      if (recent[q.id]) w *= FACTEUR_RECENT;
      return w;
    }
    function choisir(pool, slot, aussiReprendre) {
      var ex = exclus(slot);
      var libres = pool.filter(function (x) { return !choisis[x.q.id] && !ex[x.q.id]; });
      if (!libres.length) libres = pool.filter(function (x) { return !choisis[x.q.id]; });   // tout a été montré : on recommence
      if (!libres.length) return null;
      var r = rng(slot);
      return O.pondere(r, libres, libres.map(function (x) { return poids(x.q, slot, aussiReprendre); }));
    }

    // --- matière de la dernière séance de la classe dans ce cours (précédente, sinon celle du jour)
    var jours = E.jours(etat, uaa), avant = jours.filter(function (j) { return j < p.jour; });
    var jourRef = avant.length ? avant[avant.length - 1] : (jours.indexOf(p.jour) >= 0 ? p.jour : null);
    var matiere = {}, vusCours = {};
    if (index && !index.vide) {
      if (jourRef) E.seance(etat, jourRef, uaa).forEach(function (id) { index.ancetres(id).forEach(function (a) { matiere[a] = 1; }); });
      Object.keys(etat).forEach(function (id) { if (E.dansCours(id, uaa)) index.ancetres(id).forEach(function (a) { vusCours[a] = 1; }); });
    }
    var rienVu = Object.keys(etat).length === 0;

    // --- 1. précédent
    var poolPrec = qcmEch(banque, "precedent").filter(function (q) { return q.sur && matiere[q.sur]; })
      .map(function (q) { return { q: q, raison: "Matière de la séance du " + (jourRef ? O.dateFr(jourRef) : "?") }; });
    if (!poolPrec.length) poolPrec = qcmEch(banque, "precedent").filter(function (q) { return q.sur && vusCours[q.sur]; })
      .map(function (q) { return { q: q, raison: "Déjà vu dans ce cours" }; });
    var x = choisir(poolPrec, "precedent", false);
    if (x) { choisis[x.q.id] = 1; items.push(itemQcm(x.q, "precedent", uaa, x.raison)); }

    // --- 2. prérequis (ou exercice d'algèbre, une fois sur deux)
    var exo = null;
    var veutExo = p.exercice !== undefined ? p.exercice : !!(dernierEch && !dernierEch.items.some(function (it) { return it && it.graine; }));
    if (veutExo) exo = tirerExercice(p, banque, poses, base, rempl, histoOtherGraines(p));
    if (exo) items.push(exo);
    else {
      var poolPre = qcmEch(banque, "prerequis").map(function (q) { return { q: q, raison: "Prérequis de l'UAA " + uaa }; });
      x = choisir(poolPre, "prerequis", false);
      if (x) { choisis[x.q.id] = 1; items.push(itemQcm(x.q, "prerequis", uaa, x.raison)); }
    }

    // --- 3. révision espacée : UAA plus anciennes déjà vues
    var poolEsp = [];
    vues.forEach(function (u) {
      if (u === uaa) return;
      var b = (p.banques || {})[u];
      if (!b) { notes.push("Banque de l'UAA " + u + " non chargée : ignorée pour la révision espacée."); return; }
      qcmEch(b, "espace").forEach(function (q) {
        poolEsp.push({ q: q, uaa: u, raison: "Révision " + u + (reprendre[q.id] ? " · à reprendre" : "") });
      });
    });
    x = choisir(poolEsp, "espace", true);
    if (x) { choisis[x.q.id] = 1; items.push(itemQcm(x.q, "espace", x.uaa, x.raison)); }

    // --- compléter avec des prérequis supplémentaires (rien vu, début de cours, banque pauvre)
    var poolExtra = qcmEch(banque, "prerequis").map(function (q) { return { q: q, raison: "Prérequis de l'UAA " + uaa }; });
    var k = 1;
    while (items.length < CIBLE) {
      var slot = "prerequis+" + k;
      x = choisir(poolExtra, slot, false);
      if (!x) break;
      choisis[x.q.id] = 1; items.push(itemQcm(x.q, slot, uaa, x.raison)); k++;
    }
    if (items.length < CIBLE) notes.push("Banque d'échauffement insuffisante : " + items.length + " élément(s) sur " + CIBLE + ".");

    // ordre d'affichage : précédent, prérequis(+), espace
    var ordre = { precedent: 0, prerequis: 1, espace: 3 };
    items.sort(function (a, b) {
      var oa = a.slot in ordre ? ordre[a.slot] : 2, ob = b.slot in ordre ? ordre[b.slot] : 2;
      return oa - ob || (a.slot < b.slot ? -1 : 1);
    });
    return { items: items, notes: notes, rienVu: rienVu, avecExercice: !!exo, jourReference: jourRef };
  }

  function histoOtherGraines(p) { return E.grainesUtilisees(p.ev, p.classe.code); }

  function tirerExercice(p, banque, poses, base, rempl, utilisees) {
    var lots = ((banque && banque.exercices && banque.exercices.lots) || []).filter(function (l) {
      return l.niveau === p.classe.niveau && l.variantes && l.variantes.length;
    });
    if (!lots.length) return null;
    var slot = "prerequis", n = (rempl[slot] && rempl[slot].n) || 0;
    var r = O.generateur(base + "|exo|" + n);
    var ex = {}; ((rempl[slot] && rempl[slot].exclus) || []).forEach(function (g) { ex[g] = 1; });
    var lot = O.pondere(r, lots, lots.map(function (l) { return 1 / (1 + (poses[l.soustype] || 0)); }));
    var vars = lot.variantes.filter(function (v) { return !utilisees[v.graine] && !ex[v.graine]; });
    if (!vars.length) vars = lot.variantes.filter(function (v) { return !ex[v.graine]; });
    if (!vars.length) vars = lot.variantes;
    var v = vars[Math.floor(r() * vars.length)];
    return { slot: slot, kind: "exercice", id: lot.soustype, graine: v.graine, role: "prerequis", uaa: p.uaa,
             apercu: O.apercu(v.enonce), raison: "Exercice d'algèbre · " + lot.soustype };
  }

  // Éléments au format attendu par typwebProf.vote.start({ items }).
  function versVote(items) {
    return items.map(function (it) {
      return it.kind === "exercice" ? { graine: it.graine, role: it.role } : { id: it.id, role: it.role };
    });
  }
  // Identifiant servant à exclure un élément lors d'un remplacement (↻).
  function cleExclusion(it) { return it.kind === "exercice" ? it.graine : it.id; }

  return { CIBLE: CIBLE, tirer: tirer, versVote: versVote, cleExclusion: cleExclusion };
});
