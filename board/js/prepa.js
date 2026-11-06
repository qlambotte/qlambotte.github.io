/* prepa.js — page « Pilotage Prépa » : publier les solutions des séances, activer les réponses masquées (questions-réponses),
   noter les taux de réussite et composer le ticket de sortie. Écrit etat.json dans le dépôt du site coursPrepa (API GitHub),
   avec le jeton déjà configuré pour la synchronisation (il doit avoir le droit d'écrire dans ce dépôt).
   La liste des questions vient de static/questions.json (index généré au rendu du site). */
(function () {
  "use strict";
  var B = window.Board, L = B.prepa, O = B.O;
  function $(s) { return document.querySelector(s); }
  var CLE_Q = "board.prepa.questions.v1", timer;
  var THEMES_SEANCE = ["algebre", "geometrie", "trigonometrie", "analyse", "statistique", "mise-en-situation"];
  var S = { conf: null, D: null, etat: null, sha: null, q: null, theme: THEMES_SEANCE[0], occupe: false, brouillon: null, filtre: "" };

  function toast(t) { var z = $("#toast"); z.textContent = t; z.classList.add("on"); clearTimeout(timer); timer = setTimeout(function () { z.classList.remove("on"); }, 3200); }
  function avis(texte) { var a = $("#avis"); a.hidden = !texte; a.textContent = texte || ""; }
  function pastille(etat, texte) { var p = $("#cx-etat"); p.textContent = texte; p.setAttribute("data-etat", etat); }

  /* ---------- données : index des questions, etat.json ---------- */
  async function chargerQuestions() {
    var url = (S.conf.site || "").replace(/\/?$/, "/") + "static/questions.json";
    try {
      var r = await fetch(url, { cache: "no-store" });
      if (!r.ok) throw new Error("HTTP " + r.status);
      S.q = await r.json();
      try { localStorage.setItem(CLE_Q, JSON.stringify(S.q)); } catch (e) {}
    } catch (e) {
      try { S.q = JSON.parse(localStorage.getItem(CLE_Q) || "null"); } catch (x) { S.q = null; }
      if (!S.q) avis("Index des questions introuvable (" + url + ") : publie d'abord le site (le fichier est créé au rendu).");
      else avis("Index des questions : copie locale (le site n'a pas répondu).");
    }
  }
  function questions(theme, types) {
    var t = S.q && S.q.themes && S.q.themes[theme];
    return t ? t.questions.filter(function (x) { return types.indexOf(x.type) >= 0; }) : [];
  }
  async function chargerEtat() {
    var D = S.D;
    if (!D.configure()) { pastille("inactif", "Clé non configurée"); return false; }
    if (D.verrouille()) { pastille("verrouille", "Jeton verrouillé"); return false; }
    pastille("en-cours", "Chargement…");
    try {
      var r = await D.lire(S.conf.chemin || "etat.json");
      S.etat = L.lireEtat(r ? r.texte : "{}"); S.sha = r ? r.sha : null; S.brouillon = null;
      pastille("synchronise", "etat.json à jour"); avis("");
      return true;
    } catch (e) { pastille("erreur", "Erreur de lecture"); avis(e.message); return false; }
  }
  // Relit etat.json, applique la modification, écrit avec le sha lu ; sur conflit, recommence (3 essais).
  async function modifier(f, message) {
    var D = S.D, chemin = S.conf.chemin || "etat.json", essai;
    S.occupe = true; rendre();
    try {
      for (essai = 0; essai < 3; essai++) {
        var r = await D.lire(chemin), etat = L.lireEtat(r ? r.texte : "{}");
        f(etat);
        try {
          var w = await D.ecrire(chemin, L.serialiser(etat), { sha: r ? r.sha : undefined, message: "Pilotage prépa : " + message });
          S.etat = etat; S.sha = w.sha; S.brouillon = null;
          pastille("synchronise", "etat.json à jour");
          toast("Enregistré. Visible sur le site dans 1 à 2 minutes.");
          return true;
        } catch (e) { if (e.code !== "conflit" || essai === 2) throw e; }
      }
    } catch (e) { toast(e.message); avis(e.message); pastille("erreur", "Erreur d'écriture"); return false; }
    finally { S.occupe = false; rendre(); }
    return false;
  }

  /* ---------- aides d'affichage ---------- */
  function bouton(texte, cls, f) { var b = B.el("button", "btn " + cls, texte); b.type = "button"; b.disabled = S.occupe || !S.etat; b.addEventListener("click", f); return b; }
  function etatLigne(libelle, actif, texteOn, texteOff, f) {
    var l = B.el("div", "etat-ligne"), g = B.el("div"), b;
    g.appendChild(B.el("strong", "", libelle));
    g.appendChild(B.el("div", "doux", actif ? texteOn : texteOff));
    b = bouton(actif ? "Retirer" : "Publier", actif ? "t" : "cu", f);
    l.appendChild(g); l.appendChild(b); return l;
  }
  function nomTheme(id) { var t = S.q && S.q.themes && S.q.themes[id]; return t ? t.nom : (id === "mise-en-situation" ? "Mise en situation" : id); }

  /* ---------- séance : thème, solutions, votes, ticket ---------- */
  function chips() {
    var z = $("#themes"); z.textContent = "";
    THEMES_SEANCE.forEach(function (id) {
      var b = B.el("button", "chip", nomTheme(id)); b.type = "button"; b.setAttribute("aria-pressed", id === S.theme ? "true" : "false");
      b.addEventListener("click", function () { garderBrouillon(); S.theme = id; S.brouillon = null; rendre(); });
      z.appendChild(b);
    });
  }
  // Les saisies non enregistrées (taux, cases du ticket) sont lues dans la page.
  function lireSaisies() {
    var saisie = {}, ticket = [];
    document.querySelectorAll("#seance .qv[data-id]").forEach(function (r) {
      var id = r.getAttribute("data-id");
      saisie[id] = { vote: L.taux(r.querySelector(".v1").value), revote: L.taux(r.querySelector(".v2").value) };
      if (r.querySelector(".tk").checked) ticket.push(id);
    });
    return { saisie: saisie, ticket: ticket };
  }
  function garderBrouillon() { if ($("#seance .qv[data-id]")) S.brouillon = lireSaisies(); }

  function seance() {
    var z = $("#seance"), theme = S.theme, e = L.lire(S.etat || {}, theme), qs = questions(theme, ["seance"]);
    z.textContent = "";
    $("#s-sub").textContent = nomTheme(theme);
    if (!S.etat) { z.appendChild(B.el("div", "vide", "Connecte-toi pour piloter la séance.")); return; }
    z.appendChild(etatLigne("Solutions de la séance", e.solutions, "Publiées sur le site", "Verrouillées : les élèves voient une attente",
      function () { modifier(function (x) { L.fixerSolutions(x, theme, !e.solutions); }, (e.solutions ? "retirer" : "publier") + " les solutions " + theme); }));
    if (theme === "mise-en-situation") {
      z.appendChild(B.el("div", "note", "La mise en situation n'est pas corrigée en séance : publie le correctif après l'épreuve."));
      return;
    }
    if (!qs.length) { z.appendChild(B.el("div", "vide", "Aucune question de séance dans l'index.")); return; }

    z.appendChild(B.el("h3", "sh", "Taux de réussite et ticket de sortie"));
    var tete = B.el("div", "qv tete");
    ["", "Question", "Vote %", "Revote %", "Ticket"].forEach(function (t) { tete.appendChild(B.el("span", "", t)); });
    z.appendChild(tete);
    var jumeaux = {}; questions(theme, ["jumeau"]).forEach(function (j) { jumeaux[j.jumeau_de] = j.id; });
    var brouillon = S.brouillon;
    qs.forEach(function (q, i) {
      var v = e.votes[q.id] || {}, d = brouillon && brouillon.saisie[q.id], r = B.el("div", "qv"), tx = B.el("span", "tx"), a, b2, c;
      r.setAttribute("data-id", q.id);
      r.appendChild(B.el("span", "num", String(i + 1)));
      tx.appendChild(document.createTextNode(q.enonce || q.id));
      tx.appendChild(B.el("small", "", q.id + (jumeaux[q.id] ? " · jumeau " + jumeaux[q.id] : "") + (q.source ? " · " + q.source : "")));
      r.appendChild(tx);
      a = B.el("input", "v1"); a.type = "number"; a.min = 0; a.max = 100; a.step = 1; a.setAttribute("aria-label", "Vote, en pour cent, question " + (i + 1));
      b2 = B.el("input", "v2"); b2.type = "number"; b2.min = 0; b2.max = 100; b2.step = 1; b2.setAttribute("aria-label", "Revote, en pour cent, question " + (i + 1));
      a.value = d ? (d.vote == null ? "" : L.affichage(d.vote)) : L.affichage(v.vote);
      b2.value = d ? (d.revote == null ? "" : L.affichage(d.revote)) : L.affichage(v.revote);
      c = B.el("input", "tk"); c.type = "checkbox"; c.setAttribute("aria-label", "Dans le ticket, question " + (i + 1));
      c.checked = brouillon ? brouillon.ticket.indexOf(q.id) >= 0 : e.ticket.indexOf(q.id) >= 0;
      [a, b2, c].forEach(function (x) { r.appendChild(x); x.disabled = S.occupe; });
      z.appendChild(r);
    });

    var barre = B.el("div", "barre-p"), seuil = B.el("input"), prop;
    seuil.type = "number"; seuil.min = 1; seuil.max = 100; seuil.value = 50; seuil.id = "seuil"; seuil.setAttribute("aria-label", "Seuil de réussite, en pour cent");
    prop = bouton("Proposer le ticket", "t", function () {
      var s = (L.taux(seuil.value) || 0.5), lu = lireSaisies(), votes = {};
      Object.keys(lu.saisie).forEach(function (id) { votes[id] = { vote: lu.saisie[id].vote }; });
      var ids = L.proposerTicket(qs, votes, s);
      S.brouillon = { saisie: lu.saisie, ticket: ids }; rendre();
      toast(ids.length ? ids.length + " question(s) sous " + Math.round(s * 100) + " % dans le ticket." : "Aucune question sous le seuil.");
    });
    barre.appendChild(B.el("label", "doux", "Sous"));
    barre.appendChild(seuil); barre.appendChild(B.el("span", "doux", "%"));
    barre.appendChild(prop);
    barre.appendChild(bouton("Enregistrer taux et ticket", "p", function () {
      var lu = lireSaisies();
      modifier(function (x) { L.enregistrerVotes(x, theme, lu.saisie, lu.ticket); }, "taux et ticket " + theme);
    }));
    z.appendChild(barre);
    z.appendChild(B.el("div", "note", "Le ticket affiche sur le site les jumeaux des questions cochées. Les taux restent dans etat.json pour l'édition suivante."));
    z.appendChild(etatLigne("Solutions du ticket", e.ticket_solutions, "Publiées sur le site", "Verrouillées",
      function () { modifier(function (x) { L.fixerTicketSolutions(x, theme, !e.ticket_solutions); }, (e.ticket_solutions ? "retirer" : "publier") + " les solutions du ticket " + theme); }));
  }

  /* ---------- réponses masquées ---------- */
  function masquees() {
    var z = $("#masquees"), actives = L.reponsesActivees(S.etat || {}), n = 0, f = S.filtre.trim().toLowerCase();
    z.textContent = "";
    if (!S.q) { z.appendChild(B.el("div", "vide", "Index des questions indisponible.")); return; }
    Object.keys(S.q.themes).forEach(function (id) {
      S.q.themes[id].questions.filter(function (q) { return q.masquee; }).forEach(function (q) {
        if (f && (q.id + " " + (q.enonce || "")).toLowerCase().indexOf(f) < 0) return;
        var on = actives.indexOf(q.id) >= 0, r = B.el("div", "qm"), tx = B.el("span", "tx"), b;
        tx.appendChild(document.createTextNode(q.enonce || q.id));
        tx.appendChild(B.el("small", "", q.id + " · " + S.q.themes[id].nom + (q.source ? " · " + q.source : "")));
        b = bouton(on ? "Retirer" : "Activer", on ? "t" : "cu", function () {
          modifier(function (x) { L.fixerReponse(x, q.id, !on); }, (on ? "retirer" : "activer") + " la réponse " + q.id);
        });
        r.appendChild(tx); r.appendChild(b); z.appendChild(r); n++;
      });
    });
    if (!n) z.appendChild(B.el("div", "vide", f ? "Aucune question ne correspond." : "Aucune question masquée."));
  }

  /* ---------- connexion ---------- */
  function connexion() {
    var z = $("#cx"), D = S.D; z.textContent = "";
    $("#cx-sub").textContent = S.conf.depot + " · " + (S.conf.chemin || "etat.json");
    if (!D.configure()) {
      z.appendChild(B.el("div", "note cu", "Aucune clé sur cet appareil. Ouvre les réglages du pilotage UMONS et charge ta clé de synchronisation. Le jeton doit avoir le droit d'écrire le contenu du dépôt " + S.conf.depot + "."));
    } else if (D.verrouille()) {
      var f = B.el("form", "phrase"), p = B.el("input"), ok = B.el("button", "btn p", "Déverrouiller");
      p.type = "password"; p.placeholder = "Phrase secrète"; p.autocomplete = "current-password"; p.setAttribute("aria-label", "Phrase secrète du jeton");
      f.appendChild(p); f.appendChild(ok);
      f.addEventListener("submit", function (ev) {
        ev.preventDefault();
        D.deverrouiller(p.value).then(function () { toast("Jeton déverrouillé."); return demarrer(); }, function (er) { toast(er.message); });
      });
      z.appendChild(B.el("div", "note", "Le jeton est chiffré : saisis ta phrase secrète (elle reste dans cette page, jamais enregistrée)."));
      z.appendChild(f);
    } else {
      z.appendChild(B.el("div", "note", "Jeton prêt. Les modifications sont des commits sur la branche " + (S.conf.branche || "main") + " ; le site se redéploie en une à deux minutes."));
      var r = B.el("button", "btn t", "Recharger etat.json"); r.type = "button";
      r.addEventListener("click", function () { chargerEtat().then(rendre); });
      z.appendChild(r);
    }
  }

  function rendre() { chips(); seance(); masquees(); connexion(); }
  async function demarrer() { await chargerEtat(); rendre(); }

  B.charger().then(async function () {
    var c = B.conf.prepa;
    if (!c || !c.depot) { avis("config.json : la section « prepa » (dépôt, site) est absente."); return; }
    S.conf = c;
    S.D = window.Board.Depot.creer({ depot: c.depot, branche: c.branche || "main" });
    B.apparence($("#apparence"));
    $("#cx-etat").addEventListener("click", function () { chargerEtat().then(rendre); });
    $("#filtre").addEventListener("input", function (e) { S.filtre = e.target.value; masquees(); });
    await chargerQuestions();
    rendre();
    await demarrer();
  });
})();
