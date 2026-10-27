/* accueil.js — page d'accueil : aujourd'hui (Ursulines + UMONS), à venir, choix du pilotage, raccourcis. */
(function () {
  "use strict";
  var B = window.Board, O = B.O, H = B.H;
  function $(s) { return document.querySelector(s); }
  var ICO = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h10"/></svg>';

  function anneeScolaire(ymd) { var a = ymd.split("-"), y = +a[0], m = +a[1]; return m >= 8 ? y + "–" + (y + 1) : (y - 1) + "–" + y; }
  function puce(txt) { var p = B.el("span", "puce", txt); $("#puces").appendChild(p); }

  function resumeUrsulines(now) {
    var z = $("#urs-resume"), c = B.pilotageConfig();
    z.textContent = "";
    if (!c) { z.appendChild(B.el("span", "r-titre", "Horaire non chargé")); z.appendChild(B.el("span", "r-el", "Ouvre une fois le pilotage avec ta clé de synchronisation.")); return; }
    var cur = H.detecter(c, new Date(now)), p = cur ? null : H.prochaine(c, new Date(now));
    z.appendChild(B.el("span", "r-cours", cur ? "Cours en cours" : "Prochain cours"));
    if (cur) { z.appendChild(B.el("span", "r-titre", cur.classe)); z.appendChild(B.el("span", "r-el", H.libelle(cur) + (cur.local ? " · salle " + cur.local : ""))); }
    else if (p) { z.appendChild(B.el("span", "r-titre", p.creneau.classe)); z.appendChild(B.el("span", "r-el", H.libelleSeance(p))); }
    else z.appendChild(B.el("span", "r-titre", "Aucun cours prévu"));
    var proch = B.interros().filter(function (i) { return O.dateValide(i.date) && i.date >= B.aujourdhui(); }).sort(function (a, b) { return a.date < b.date ? -1 : 1; })[0];
    if (proch) z.appendChild(B.el("span", "r-el", "Prochaine interro : " + proch.classe + ", " + O.dateFr(proch.date) + (proch.uaa ? " (" + proch.uaa + ")" : "")));
  }

  function resumeUnif(now, today) {
    var z = $("#unif-resume"), evts = B.evenements().filter(function (e) { return !e.journee && e.fin > now; }), e = evts[0];
    var ouvertes = B.taches.liste().filter(function (t) { return !t.fait; }), sem = O.ajouterJours(today, 7);
    var proches = ouvertes.filter(function (t) { return t.ech && t.ech <= sem; }).length;
    z.textContent = "";
    z.appendChild(B.el("span", "r-cours", e && e.debut <= now ? "En cours" : "Prochain événement"));
    if (e) {
      var l = B.local(e.debut), auj = l.ymd === today;
      z.appendChild(B.el("span", "r-titre", e.titre));
      z.appendChild(B.el("span", "r-el", (auj ? "aujourd'hui" : B.jourCourt(l.ymd) + " " + O.dateFr(l.ymd)) + " à " + B.hFr(e.debut) + (e.lieu ? " · " + e.lieu : "")));
    } else z.appendChild(B.el("span", "r-titre", Object.keys(B.sources()).length ? "Rien de prévu" : "Aucun horaire importé"));
    z.appendChild(B.el("span", "r-el", ouvertes.length + " tâche" + (ouvertes.length > 1 ? "s" : "") + " à faire" + (proches ? ", dont " + proches + " cette semaine" : "")));
  }

  function aVenir(today) {
    var fin = O.ajouterJours(today, 14), items = [], now = B.maintenant();
    B.interros().forEach(function (i) { if (O.dateValide(i.date) && i.date >= today && i.date <= fin) items.push({ ymd: i.date, texte: (i.type || "Interro") + " · " + i.classe + (i.uaa ? " · " + i.uaa : ""), tag: "Ursulines", cu: false }); });
    B.jalons().forEach(function (j) { if (j.date >= today && j.date <= fin) items.push({ ymd: j.date, texte: j.texte, tag: j.ecole === "unif" ? "UMONS" : "Ursulines", cu: j.ecole === "unif" }); });
    B.evenementsEntre(today, fin).filter(function (e) { return B.estImportant(e) && e.fin > now; }).forEach(function (e) { items.push({ ymd: B.local(e.debut).ymd, texte: e.titre, tag: "UMONS", cu: true }); });
    B.taches.liste().filter(function (t) { return !t.fait && t.ech && t.ech <= fin; }).forEach(function (t) { items.push({ ymd: t.ech < today ? today : t.ech, texte: t.texte, tag: "UMONS · tâche", cu: true, retard: t.ech < today }); });
    items.sort(function (a, b) { return a.ymd < b.ymd ? -1 : a.ymd > b.ymd ? 1 : 0; });
    var z = $("#avenir"); z.textContent = "";
    if (!items.length) { z.appendChild(B.el("div", "vide", "Rien d'important dans les 14 prochains jours.")); return; }
    items.slice(0, 8).forEach(function (it) {
      var r = B.el("div", "iro"), dt = B.el("span", "dt"), f = B.el("span", "f"), a = it.ymd.split("-");
      dt.appendChild(B.el("b", "", String(+a[2]))); dt.appendChild(document.createTextNode(B.mois(it.ymd)));
      f.appendChild(B.el("span", "", it.texte)); f.appendChild(B.el("span", "tag" + (it.cu ? " cu" : ""), it.tag));
      r.appendChild(dt); r.appendChild(f);
      var n = O.ecartJours(today, it.ymd);
      if (n <= 3) r.appendChild(B.el("span", "j proche", it.retard ? "en retard" : B.relatif(it.ymd)));
      z.appendChild(r);
    });
    if (items.length > 8) z.appendChild(B.el("div", "doux", "… et " + (items.length - 8) + " autre(s)."));
  }

  function raccourcis() {
    var z = $("#raccourcis"); z.textContent = "";
    (B.conf.raccourcis || []).forEach(function (r) {
      var a = B.lien("", r.url), badge = B.el("span", "badge " + (r.groupe === "unif" ? "b-cu" : "b-a")), tx = B.el("span", "", r.titre);
      badge.innerHTML = ICO; tx.appendChild(B.el("small", "", r.detail || ""));
      a.appendChild(badge); a.appendChild(tx); z.appendChild(a);
    });
  }

  function rendre() {
    var now = B.maintenant(), today = B.aujourdhui(), items = B.journee(today);
    $("#annee").textContent = "Année " + anneeScolaire(today);
    $("#titre").textContent = B.dateLongue(today);
    var nU = items.filter(function (i) { return i.type === "urs"; }).length, nE = items.filter(function (i) { return i.type === "unif"; }).length;
    var sem = O.ajouterJours(today, 7), ech = B.taches.liste().filter(function (t) { return !t.fait && t.ech && t.ech <= sem; }).length + B.jalons().filter(function (j) { return j.date >= today && j.date <= sem; }).length;
    $("#puces").textContent = "";
    puce(nU + " cours aux Ursulines"); puce(nE + " événement" + (nE > 1 ? "s" : "") + " UMONS"); puce(ech + " échéance" + (ech > 1 ? "s" : "") + " cette semaine");
    var suiv = B.bandeauTemps(items, now);
    $("#prochaine").textContent = suiv ? "Prochain : " + suiv.titre + " à " + B.hFr(suiv.debut) + (suiv.detail ? ", " + suiv.detail : "") : "";
    var z = $("#aujourdhui"); z.textContent = "";
    if (!items.length) z.appendChild(B.el("div", "ev libre", "Rien de prévu aujourd'hui."));
    items.forEach(function (it) { z.appendChild(B.ligneEvenement(it, now)); });
    resumeUrsulines(now); resumeUnif(now, today); aVenir(today); raccourcis();
  }

  B.charger().then(function () {
    B.pastilleSync($("#sync-etat")); B.apparence($("#apparence"));
    $("#sync-etat").addEventListener("click", function () { if (!B.depot.configure() || B.depot.verrouille()) location.href = "unif.html#reglages"; else B.synchroniser(); });
    rendre(); B.abonner(rendre); setInterval(rendre, 30000);
    B.demarrer();
  });
})();
