/* unif.js — pilotage UMONS : horaire du jour, cours, semaine, tâches ; réglages (import .ics, synchronisation). */
(function () {
  "use strict";
  var B = window.Board, O = B.O;
  function $(s) { return document.querySelector(s); }
  var ICO_LIEN = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>';
  var timer;
  function toast(t) { var z = $("#toast"); z.textContent = t; z.classList.add("on"); clearTimeout(timer); timer = setTimeout(function () { z.classList.remove("on"); }, 2600); }

  /* ---------- jour affiché (aujourd'hui, ou un autre jour : à venir ou passé) ---------- */
  var jour = null;
  function jourDeUrl() { var m = /[?&]jour=(\d{4}-\d{2}-\d{2})/.exec(location.search); return m && O.dateValide(m[1]) ? m[1] : null; }
  function majUrl() {
    try {
      var p = new URLSearchParams(location.search);
      if (jour === B.aujourdhui()) p.delete("jour"); else p.set("jour", jour);
      var q = p.toString();
      history.replaceState(history.state, "", location.pathname + (q ? "?" + q : "") + location.hash);
    } catch (e) {}
  }
  function choisir(ymd) {
    if (!O.dateValide(ymd)) return;
    jour = ymd; majUrl(); rendre();
  }

  /* ---------- horaire du jour ---------- */
  function horaire(now, today) {
    var z = $("#horaire"), sub = $("#horaire-sub"), aujourdhui = jour === today, evts = B.evenementsDuJour(jour).map(function (e) {
      return { type: "unif", debut: e.debut, fin: e.fin, journee: e.journee, titre: e.titre, detail: e.lieu || "", tag: B.SOURCES[e.source] || "UMONS", liens: B.liensDe(e) };
    });
    evts.sort(function (a, b) { return (a.journee ? 0 : 1) - (b.journee ? 0 : 1) || a.debut - b.debut; });
    z.textContent = "";
    $("#horaire-titre").textContent = aujourdhui ? "Horaire du jour" : "Horaire du " + B.jourCourt(jour).replace(".", "") + " " + O.dateFr(jour);
    var src = Object.keys(B.sources()).map(function (k) { return B.SOURCES[k]; });
    sub.textContent = src.length ? src.join(" et ") : "aucun horaire importé";
    if (!src.length) {
      z.appendChild(B.el("div", "ev libre", "Aucun horaire importé : ouvre les réglages pour charger un fichier .ics."));
      return evts;
    }
    // jour passé : tout est « fait » ; jour à venir : rien n'est en cours
    var ref = jour < today ? Number.MAX_SAFE_INTEGER : jour > today ? 0 : now;
    if (!evts.length) z.appendChild(B.el("div", "ev libre", aujourdhui ? "Rien de prévu aujourd'hui." : "Rien de prévu ce jour-là."));
    evts.forEach(function (it) { z.appendChild(B.ligneEvenement(it, ref)); });
    if (B.horsPeriode(jour)) z.appendChild(B.el("div", "vide", "Ce jour est en dehors des périodes importées : l'horaire est peut-être incomplet (importe un fichier plus récent ou plus ancien)."));
    var apres = evts.filter(function (i) { return i.fin > now || i.journee; });
    if (aujourdhui && evts.length && !apres.length) z.appendChild(B.el("div", "ev libre", "Plus rien de prévu aujourd'hui."));
    if (aujourdhui && (!evts.length || !apres.length)) {                  // prochain jour avec des événements
      var j, prochain = null;
      for (j = 1; j <= 30 && !prochain; j++) { var y = O.ajouterJours(today, j), l = B.evenementsDuJour(y).filter(function (e) { return !e.journee; }); if (l.length) prochain = { ymd: y, e: l[0] }; }
      if (prochain) z.appendChild(B.el("div", "vide", "Prochain : " + B.jourCourt(prochain.ymd) + " " + O.dateFr(prochain.ymd) + ", " + B.hFr(prochain.e.debut) + " · " + prochain.e.titre));
    }
    return evts;
  }

  function cours() {
    var z = $("#cours"); z.textContent = "";
    (B.conf.cours || []).forEach(function (c) {
      var a = B.lien("", c.url), badge = B.el("span", "badge " + (c.url ? "b-a" : "b-ol")), tx = B.el("span", "", c.titre);
      badge.innerHTML = ICO_LIEN; tx.appendChild(B.el("small", "", c.url ? c.detail || "" : "lien à renseigner"));
      a.appendChild(badge); a.appendChild(tx); z.appendChild(a);
    });
  }

  function semaine(today) {
    var z = $("#semaine"), lundi = O.ajouterJours(jour, -((O.jourSemaine(jour) + 6) % 7)), i; z.textContent = "";
    for (i = 0; i < 5; i++) {
      (function (y) {
        var d = B.el("div", y === jour ? "auj" : ""), l = B.evenementsDuJour(y), c = B.el("span", "c");
        d.setAttribute("role", "button"); d.tabIndex = 0; d.setAttribute("aria-label", "Afficher le " + B.dateLongue(y).toLowerCase());
        d.appendChild(B.el("b", "", B.jourCourt(y).replace(".", "") + " " + (+y.split("-")[2]) + (y === today ? " ·" : "")));
        if (!l.length) c.textContent = "–";
        l.slice(0, 3).forEach(function (e, k) { if (k) c.appendChild(document.createElement("br")); c.appendChild(document.createTextNode((e.journee ? "" : B.hm(e.debut) + " ") + e.titre)); });
        if (l.length > 3) { c.appendChild(document.createElement("br")); c.appendChild(document.createTextNode("+ " + (l.length - 3) + " autre(s)")); }
        d.appendChild(c); z.appendChild(d);
        d.addEventListener("click", function () { choisir(y); });
        d.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); choisir(y); } });
      })(O.ajouterJours(lundi, i));
    }
  }

  /* ---------- tâches ---------- */
  function taches(today) {
    var z = $("#taches"), liste = B.taches.liste(), ouvertes = liste.filter(function (t) { return !t.fait; }).length;
    $("#taches-sub").textContent = B.depot.configure() ? "synchronisées avec le dépôt privé" : "sur cet appareil (synchro non configurée)";
    $("#taches-faites").hidden = !liste.some(function (t) { return t.fait; });
    z.textContent = "";
    if (!liste.length) z.appendChild(B.el("div", "vide", "Aucune tâche."));
    liste.forEach(function (t) {
      var r = B.el("label", "tache case" + (t.fait ? " fait" : "")), c = B.el("input"), tx = B.el("span", "tx", t.texte);
      c.type = "checkbox"; c.checked = t.fait; c.setAttribute("aria-label", "Fait : " + t.texte);
      c.addEventListener("change", function () { B.taches.basculer(t.id, c.checked); });
      r.appendChild(c); r.appendChild(tx);
      if (t.ech) { var retard = !t.fait && t.ech < today; r.appendChild(B.el("span", "tag" + (retard ? " retard" : t.ech === today || O.ecartJours(today, t.ech) <= 3 ? " cu" : ""), t.fait ? B.jourCourt(t.ech) + " " + O.dateFr(t.ech) : B.jourCourt(t.ech) + " " + O.dateFr(t.ech))); }
      else r.appendChild(B.el("span"));
      var x = B.el("button", "", "✕"); x.type = "button"; x.title = "Supprimer"; x.setAttribute("aria-label", "Supprimer : " + t.texte);
      x.addEventListener("click", function (e) { e.preventDefault(); B.taches.supprimer(t.id); });
      r.appendChild(x); z.appendChild(r);
    });
    return ouvertes;
  }

  /* ---------- bandeau ---------- */
  function bandeau(now, today, evts) {
    var aujourdhui = jour === today;
    $("#titre").textContent = B.dateLongue(jour);
    $("#sous-date").textContent = "FMPB · bac 1" + (aujourdhui ? "" : " · " + B.relJour(jour));
    var nE = evts.length, ouv = B.taches.liste().filter(function (t) { return !t.fait; }).length, z = $("#puces"); z.textContent = "";
    z.appendChild(B.el("span", "puce", nE + " événement" + (nE > 1 ? "s" : ""))); z.appendChild(B.el("span", "puce", ouv + " tâche" + (ouv > 1 ? "s" : "") + " à faire"));
    if (aujourdhui) {
      var suiv = B.bandeauTemps(evts, now);
      $("#prochaine").textContent = suiv ? "Prochain : " + suiv.titre + " à " + B.hFr(suiv.debut) + (suiv.detail ? ", " + suiv.detail : "") : "";
    } else {
      $("#temps").hidden = true;
      var prem = evts.filter(function (i) { return !i.journee; })[0];
      $("#prochaine").textContent = prem ? "Premier : " + prem.titre + " à " + B.hFr(prem.debut) + (prem.detail ? ", " + prem.detail : "") : "";
    }
    $("#jour-date").value = jour;
    $("#jour-rel").textContent = aujourdhui ? "" : B.relJour(jour);
    $("#jour-auj").hidden = aujourdhui;
  }

  function rendre() {
    var now = B.maintenant(), today = B.aujourdhui();
    if (!jour) jour = jourDeUrl() || today;
    var evts = horaire(now, today);
    bandeau(now, today, evts); cours(); semaine(today); taches(today); reglages();
  }

  /* ---------- réglages ---------- */
  function importer(source, fichier) {
    if (!fichier) return;
    if (fichier.size > 8 * 1024 * 1024) { toast("Fichier trop volumineux (8 Mo au plus)."); return; }
    fichier.text().then(function (txt) {
      try { var n = B.importerICS(txt, source, fichier.name); toast(B.SOURCES[source] + " : " + n + " événement" + (n > 1 ? "s" : "") + " importé" + (n > 1 ? "s" : "") + "."); }
      catch (e) { toast(e.message); }
    });
  }
  function reglages() {
    if ($("#vue-reglages").hidden) return;
    var z = $("#sources"), s = B.sources(); z.textContent = "";
    Object.keys(B.SOURCES).forEach(function (k) {
      var b = B.el("div", "source"), info = s[k], n = info ? (info.evenements || []).length : 0;
      b.appendChild(B.el("div", "nom", B.SOURCES[k]));
      b.appendChild(B.el("div", "doux", info && info.importe ? n + " événement" + (n > 1 ? "s" : "") + " · importé le " + new Date(info.importe).toLocaleDateString("fr-BE") + (info.nom ? " (" + info.nom + ")" : "") : "rien d'importé"));
      var f = B.el("input"); f.type = "file"; f.accept = ".ics,text/calendar"; f.setAttribute("aria-label", "Importer un fichier .ics pour " + B.SOURCES[k]);
      f.addEventListener("change", function () { importer(k, f.files[0]); f.value = ""; });
      b.appendChild(f);
      if (n) { var r = B.el("button", "btn discret", "Retirer cette source"); r.type = "button"; r.addEventListener("click", function () { B.retirerSource(k); toast(B.SOURCES[k] + " retiré."); }); b.appendChild(r); }
      z.appendChild(b);
    });
    var y = $("#synchro"); y.textContent = "";
    var st = B.statut();
    y.appendChild(B.el("div", "note", st.texte + (B.depot.configure() ? " · dépôt " + B.depot.depot() : "")));
    if (!B.depot.configure()) {
      var n2 = B.el("div", "note cu", "Aucune clé sur cet appareil : ouvre le "); var a = B.el("a", "", "pilotage"); a.href = "../pilotage/#reglages"; n2.appendChild(a); n2.appendChild(document.createTextNode(" et charge ta clé de synchronisation (la même sert ici). Sans elle, horaire et tâches restent sur cet appareil."));
      y.appendChild(n2);
    } else if (B.depot.verrouille()) {
      var f2 = B.el("form", "phrase"), p = B.el("input"); p.type = "password"; p.placeholder = "Phrase secrète"; p.autocomplete = "current-password"; p.setAttribute("aria-label", "Phrase secrète du jeton");
      var ok = B.el("button", "btn p", "Déverrouiller"); ok.type = "submit"; f2.appendChild(p); f2.appendChild(ok);
      f2.addEventListener("submit", function (e) { e.preventDefault(); B.depot.deverrouiller(p.value).then(function () { toast("Jeton déverrouillé."); B.synchroniser(); }, function (er) { toast(er.message); }); });
      y.appendChild(f2);
    } else {
      var go = B.el("button", "btn t", "Synchroniser maintenant"); go.type = "button"; go.addEventListener("click", function () { B.synchroniser().then(function (r) { toast(r ? "Synchronisé." : B.statut().texte); }); });
      y.appendChild(go);
    }
    var nj = B.jalons().length; $("#jalons-etat").textContent = nj ? nj + " jalon" + (nj > 1 ? "s" : "") + " chargé" + (nj > 1 ? "s" : "") + " depuis le dépôt." : "Aucun jalon chargé.";
  }
  function vue() {
    var r = location.hash === "#reglages";
    $("#vue-unif").hidden = r; $("#vue-reglages").hidden = !r;
    window.scrollTo(0, 0); rendre();
  }

  B.charger().then(function () {
    B.pastilleSync($("#sync-etat")); B.apparence($("#apparence"));
    $("#sync-etat").addEventListener("click", function () { location.hash = "#reglages"; });
    $("#fermer-reglages").addEventListener("click", function (e) { e.preventDefault(); history.pushState("", document.title, location.pathname + location.search); vue(); });
    $("#jour-prec").addEventListener("click", function () { choisir(O.ajouterJours(jour, -1)); });
    $("#jour-suiv").addEventListener("click", function () { choisir(O.ajouterJours(jour, 1)); });
    $("#jour-auj").addEventListener("click", function () { choisir(B.aujourdhui()); });
    $("#jour-date").addEventListener("change", function () { if (this.value) choisir(this.value); });
    document.addEventListener("keydown", function (e) {
      if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.altKey || e.ctrlKey || e.metaKey || !$("#vue-reglages").hidden) return;
      if (e.key === "ArrowLeft") choisir(O.ajouterJours(jour, -1)); else if (e.key === "ArrowRight") choisir(O.ajouterJours(jour, 1));
    });
    $("#ajout").addEventListener("submit", function (e) {
      e.preventDefault();
      var t = B.taches.ajouter($("#nv").value, $("#nv-date").value);
      if (t) { $("#nv").value = ""; $("#nv-date").value = ""; } else toast("Écris d'abord la tâche.");
    });
    $("#taches-faites").addEventListener("click", function () { var n = B.taches.effacerFaites(); if (n) toast(n + " tâche" + (n > 1 ? "s" : "") + " retirée" + (n > 1 ? "s" : "") + "."); });
    window.addEventListener("hashchange", vue);
    B.abonner(rendre); setInterval(rendre, 30000);
    vue(); B.demarrer();
  });
})();
