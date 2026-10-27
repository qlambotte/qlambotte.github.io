/* board.js — cœur commun du tableau de bord (accueil et pilotage UMONS) : configuration, horaire importé (.ics),
   tâches, synchronisation avec le dépôt privé, aides d'affichage. Fonctionne hors ligne (copie locale d'abord).
   Dépend de ../pilotage/js/outils.js et horaire.js (dates, détection du créneau des Ursulines). */
(function () {
  "use strict";
  var B = window.Board = window.Board || {}, O = window.Pilotage.outils, H = window.Pilotage.horaire;
  var CLE_HORAIRE = "board.horaire.v1", CLE_JALONS = "board.jalons.v1", CLE_CONF_PIL = "typweb.sync.config";
  var DOSSIER = "unif", MOIS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
  var JOURS_LONGS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
  var SOURCES = { outlook: "Outlook", hplanning: "HPlanning" };
  B.O = O; B.H = H; B.SOURCES = SOURCES;

  /* ---------- stockage local sûr ---------- */
  function lireJson(cle) { try { var b = localStorage.getItem(cle); return b ? JSON.parse(b) : null; } catch (e) { return null; } }
  function ecrireJson(cle, v) { try { localStorage.setItem(cle, JSON.stringify(v)); return true; } catch (e) { return false; } }

  /* ---------- l'instant présent (?maintenant=… pour les essais) ---------- */
  var decalage = 0;
  (function () {
    var m = /[?&]maintenant=([^&]+)/.exec(location.search);
    if (m) { var t = Date.parse(decodeURIComponent(m[1])); if (isFinite(t)) decalage = t - Date.now(); }
  })();
  B.maintenant = function () { return Date.now() + decalage; };
  B.local = function (t) { return O.local(t == null ? B.maintenant() : t, B.conf ? B.conf.fuseau : O.FUSEAU); };
  B.aujourdhui = function () { return B.local().ymd; };

  /* ---------- formats ---------- */
  B.p2 = O.p2;
  B.hm = function (t) { var l = B.local(t); return l.h + ":" + O.p2(l.min); };
  B.hFr = function (t) { var l = B.local(t); return l.h + " h " + O.p2(l.min); };
  B.dateLongue = function (ymd) { var a = ymd.split("-"), j = JOURS_LONGS[O.jourSemaine(ymd)]; return j.charAt(0).toUpperCase() + j.slice(1) + " " + (+a[2]) + (+a[2] === 1 ? "er " : " ") + ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"][+a[1] - 1]; };
  B.jourCourt = function (ymd) { return JOURS_LONGS[O.jourSemaine(ymd)].slice(0, 3) + "."; };
  B.mois = function (ymd) { return MOIS[+ymd.split("-")[1] - 1]; };
  B.relatif = function (ymd) {
    var n = O.ecartJours(B.aujourdhui(), ymd);
    return n === 0 ? "aujourd'hui" : n === 1 ? "demain" : n === -1 ? "hier" : n < 0 ? "en retard de " + (-n) + " j" : "dans " + n + " j";
  };
  B.dansMinutes = function (min) {
    min = Math.round(min);
    if (min < 1) return "maintenant";
    if (min < 60) return "dans " + min + " min";
    var h = Math.floor(min / 60), r = min % 60;
    return "dans " + h + " h" + (r ? " " + O.p2(r) : "");
  };
  B.el = function (tag, cls, texte) { var e = document.createElement(tag); if (cls) e.className = cls; if (texte != null) e.textContent = texte; return e; };
  B.lienSur = function (url) { return /^https?:\/\//i.test(url || "") ? url : ""; };
  B.lien = function (texte, url, cls) {
    var a = B.el("a", cls || "", texte), u = B.lienSur(url);
    if (u) { a.href = u; a.target = "_blank"; a.rel = "noopener noreferrer"; } else { a.setAttribute("aria-disabled", "true"); a.className += " off"; a.title = "Lien à renseigner dans config.json"; }
    return a;
  };

  /* ---------- configuration publique ---------- */
  B.conf = { fuseau: O.FUSEAU, cours: [], raccourcis: [], evenements: { liens: [], importants: [], categories: [] } };
  B.charger = function () {
    return fetch("config.json", { cache: "no-cache" }).then(function (r) { return r.ok ? r.json() : null; }).then(function (c) {
      if (c && typeof c === "object") B.conf = Object.assign(B.conf, c, { evenements: Object.assign({ liens: [], importants: [], categories: [] }, c.evenements || {}) });
      ecrireJson("board.config.v1", B.conf);
    }).catch(function () { var c = lireJson("board.config.v1"); if (c) B.conf = c; });
  };

  /* ---------- horaire UMONS (événements importés d'un .ics) ---------- */
  // Stockage : { v:1, sources: { outlook: { importe, nom, evenements:[…] }, hplanning: {…} } }
  function horaireLocal() { var h = lireJson(CLE_HORAIRE); return h && h.sources ? h : { v: 1, sources: {} }; }
  B.sources = function () { return horaireLocal().sources; };
  B.evenements = function () {
    var s = horaireLocal().sources, tous = [];
    Object.keys(s).forEach(function (k) { (s[k].evenements || []).forEach(function (e) { tous.push(Object.assign({ source: k }, e)); }); });
    return tous.sort(function (a, b) { return a.debut - b.debut; });
  };
  B.importerICS = function (texte, source, nom) {
    if (!SOURCES[source]) throw new Error("Source inconnue.");
    var now = B.maintenant(), evts = window.Board.ics.lire(texte, { de: now - 30 * 86400000, a: now + 240 * 86400000 });
    if (!evts.length && !/BEGIN:VEVENT/i.test(texte)) throw new Error("Ce fichier ne ressemble pas à un calendrier .ics.");
    var h = horaireLocal();
    h.sources[source] = { importe: Date.now(), nom: String(nom || "").slice(0, 80), evenements: evts.map(function (e) {
      return { id: e.id, debut: e.debut, fin: e.fin, journee: e.journee, jour: e.jour, titre: e.titre, lieu: e.lieu, url: B.lienSur(e.url), cats: e.cats, prio: e.prio };
    }) };
    ecrireJson(CLE_HORAIRE, h); B.notifier();
    B.planifier("horaire");
    return evts.length;
  };
  B.retirerSource = function (source) {
    var h = horaireLocal();
    if (!h.sources[source]) return false;
    h.sources[source] = { importe: Date.now(), nom: "", evenements: [] };
    ecrireJson(CLE_HORAIRE, h); B.notifier(); B.planifier("horaire"); return true;
  };
  function debutJour(ymd) { var a = ymd.split("-"); return window.Board.ics.murale(+a[0], +a[1], +a[2], 0, 0, 0, B.conf.fuseau); }
  // Événements qui touchent le jour `ymd` (les « journée entière » compris).
  B.evenementsDuJour = function (ymd) {
    var d = debutJour(ymd), f = debutJour(O.ajouterJours(ymd, 1));
    return B.evenements().filter(function (e) { return e.debut < f && (e.fin > d || (e.fin === e.debut && e.debut >= d)); });
  };
  B.evenementsEntre = function (ymd1, ymd2) {
    var d = debutJour(ymd1), f = debutJour(O.ajouterJours(ymd2, 1));
    return B.evenements().filter(function (e) { return e.debut < f && (e.fin > d || (e.fin === e.debut && e.debut >= d)); });
  };
  B.estImportant = function (e) {
    var ev = B.conf.evenements, t = (e.titre || "").toLowerCase();
    if ((e.prio >= 1 && e.prio <= 4) || (e.cats || []).some(function (c) { return (ev.categories || []).indexOf(String(c).toLowerCase()) >= 0; })) return true;
    return (ev.importants || []).some(function (m) { return t.indexOf(String(m).toLowerCase()) >= 0; });
  };
  // Liens de cours liés à un événement (règles de config.json) + son lien propre (réunion Teams…).
  B.liensDe = function (e) {
    var sortie = [];
    (B.conf.evenements.liens || []).forEach(function (r) {
      var re; try { re = new RegExp(r.motif, "i"); } catch (x) { return; }
      if (!re.test(e.titre || "")) return;
      (r.cours || []).forEach(function (id) {
        var c = (B.conf.cours || []).filter(function (x) { return x.id === id; })[0];
        if (c && c.url && !sortie.some(function (s) { return s.url === c.url; })) sortie.push({ texte: c.titre.replace(/^IMSV · /, ""), url: c.url });
      });
    });
    if (e.url) sortie.push({ texte: /teams\./i.test(e.url) ? "réunion" : "lien", url: e.url });
    return sortie;
  };

  /* ---------- Ursulines : horaire et interros lus dans la copie locale de config/pilotage.json ---------- */
  B.pilotageConfig = function () {
    try { var b = localStorage.getItem(CLE_CONF_PIL); if (!b) return null; var c = JSON.parse(b); return c && Array.isArray(c.creneaux) ? c : null; } catch (e) { return null; }
  };
  B.creneauxUrsulines = function (ymd) {
    var c = B.pilotageConfig();
    if (!c || H.estConge(c, ymd)) return [];
    var j = O.jourSemaine(ymd);
    return (c.creneaux || []).filter(function (s) { return O.JOURS.indexOf(s.jour) === j; }).sort(function (a, b) { return O.minutes(a.debut) - O.minutes(b.debut); });
  };
  B.interros = function () { var c = B.pilotageConfig(); return c && Array.isArray(c.interros) ? c.interros : []; };

  /* ---------- jalons saisis à la main (unif/jalons.json du dépôt privé) ---------- */
  B.jalons = function () { var j = lireJson(CLE_JALONS); return j && Array.isArray(j.jalons) ? j.jalons.filter(function (x) { return O.dateValide(x.date) && x.texte; }) : []; };

  /* ---------- tâches ---------- */
  B.taches = window.Board.taches.creer();
  B.depot = window.Board.depot.creer();

  /* ---------- synchronisation ---------- */
  var abonnes = [], etat = { etat: B.depot.configure() ? "attente" : "inactif", texte: B.depot.configure() ? "Synchro en attente" : "Synchro non configurée", quand: 0 };
  B.statut = function () { return etat; };
  B.abonner = function (f) { abonnes.push(f); };
  B.notifier = function () { abonnes.slice().forEach(function (f) { try { f(); } catch (e) {} }); };
  function statut(e, texte) { etat = { etat: e, texte: texte, quand: B.maintenant() }; B.notifier(); }
  function canon(x) { return JSON.stringify(x); }

  async function synchroTaches() {
    var d = B.depot, ch = DOSSIER + "/taches.json", n = 0;
    for (n = 0; n < 3; n++) {
      var r = await d.lire(ch);
      if (r) B.taches.fusionner(r.texte);
      var local = B.taches.serialiser();
      if (r && canon(JSON.parse(r.texte)) === canon(JSON.parse(local))) return;
      try { await d.ecrire(ch, local, { sha: r ? r.sha : null, message: "Tâches" }); return; }
      catch (e) { if (e.code !== "conflit") throw e; }
    }
  }
  async function synchroHoraire() {
    var d = B.depot, ch = DOSSIER + "/horaire.json", r = await d.lire(ch), local = horaireLocal(), dist = null, change = false, pousser = false;
    if (r) { try { dist = JSON.parse(r.texte); } catch (e) { dist = null; } }
    if (dist && dist.sources) Object.keys(dist.sources).forEach(function (k) {
      if (!SOURCES[k] || !Array.isArray(dist.sources[k].evenements)) return;
      if (!local.sources[k] || dist.sources[k].importe > local.sources[k].importe) { local.sources[k] = dist.sources[k]; change = true; }
    });
    if (change) { ecrireJson(CLE_HORAIRE, local); B.notifier(); }
    Object.keys(local.sources).forEach(function (k) { if (!dist || !dist.sources || !dist.sources[k] || dist.sources[k].importe < local.sources[k].importe) pousser = true; });
    if (pousser) await d.ecrire(ch, JSON.stringify({ v: 1, sources: local.sources }), { sha: r ? r.sha : null, message: "Horaire importé" });
  }
  async function lireJalons() {
    var r = await B.depot.lire(DOSSIER + "/jalons.json");
    if (r) { try { var j = JSON.parse(r.texte); if (j && Array.isArray(j.jalons)) { ecrireJson(CLE_JALONS, j); B.notifier(); } } catch (e) {} }
  }
  async function lireConfigPilotage() {
    var r = await B.depot.lire("config/pilotage.json");
    if (r) { try { JSON.parse(r.texte); localStorage.setItem(CLE_CONF_PIL, r.texte); B.notifier(); } catch (e) {} }
  }
  var enCours = null, aFaire = {};
  B.synchroniser = function () {
    if (!B.depot.configure()) { statut("inactif", "Synchro non configurée"); return Promise.resolve(false); }
    if (B.depot.verrouille()) { statut("verrouille", "Jeton verrouillé"); return Promise.resolve(false); }
    if (enCours) return enCours;
    if (navigator.onLine === false) { statut("hors-ligne", "Hors ligne : copie locale"); return Promise.resolve(false); }
    statut("en-cours", "Synchro…");
    enCours = (async function () {
      try {
        await synchroTaches(); await synchroHoraire(); await lireJalons(); await lireConfigPilotage();
        statut("synchronise", "Synchro · " + B.hFr(B.maintenant())); return true;
      } catch (e) {
        statut(e.code === "reseau" ? "hors-ligne" : "erreur", e.code === "reseau" ? "Hors ligne : copie locale" : (e.message || "Erreur de synchronisation"));
        return false;
      } finally { enCours = null; }
    })();
    return enCours;
  };
  // Demande une synchronisation après un changement local (regroupe les modifications rapprochées).
  var minuteur = null;
  B.planifier = function () { clearTimeout(minuteur); minuteur = setTimeout(function () { B.synchroniser(); }, 1200); };
  B.taches.abonner(function () { B.planifier("taches"); B.notifier(); });
  B.demarrer = function () {
    B.synchroniser();
    setInterval(function () { if (document.visibilityState === "visible") B.synchroniser(); }, 120000);
    window.addEventListener("online", function () { B.synchroniser(); });
    document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible") B.synchroniser(); });
    if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(function () {});
  };
  B.pastilleSync = function (p) {
    function maj() {
      var s = B.statut();
      p.textContent = s.texte; p.setAttribute("data-etat", s.etat === "attente" ? "a-synchroniser" : s.etat);
      p.title = s.etat === "inactif" ? "Ouvre les réglages du pilotage et charge ta clé de synchronisation." : s.texte;
    }
    maj(); B.abonner(maj);
  };

  /* ---------- apparence : jour / soir / auto (même réglage que le pilotage) ---------- */
  B.apparence = function (btn) {
    var T = window.Pilotage && window.Pilotage.theme;
    if (!T || !btn) return;
    var noms = { jour: "Jour", soir: "Soir", auto: "Auto" };
    function maj() { var il = btn.querySelector(".il"); if (il) il.textContent = noms[T.lire()]; }
    btn.addEventListener("click", function () { var v = T.VALEURS, i = (v.indexOf(T.lire()) + 1) % v.length; T.choisir(v[i]); maj(); });
    maj();
  };

  /* ---------- aujourd'hui : cours des Ursulines + événements UMONS, triés ---------- */
  // → [{ type:"urs"|"unif", debut, fin, titre, detail, tag, liens, ev }]
  B.journee = function (ymd) {
    var liste = [], c = B.pilotageConfig(), niveaux = {};
    if (c) (c.classes || []).forEach(function (k) { niveaux[k.code] = k.niveau; });
    B.creneauxUrsulines(ymd).forEach(function (s) {
      var d = debutJour(ymd);
      liste.push({ type: "urs", debut: d + O.minutes(s.debut) * 60000, fin: d + O.minutes(s.fin) * 60000, titre: s.classe + " · Mathématiques",
                   detail: s.local ? "Salle " + s.local : "", tag: "Ursulines", liens: [] });
    });
    B.evenementsDuJour(ymd).forEach(function (e) {
      liste.push({ type: "unif", debut: e.debut, fin: e.fin, journee: e.journee, titre: e.titre, detail: e.lieu || "", tag: SOURCES[e.source] || "UMONS",
                   liens: B.liensDe(e), ev: e });
    });
    return liste.sort(function (a, b) { return (a.journee ? 0 : 1) - (b.journee ? 0 : 1) || a.debut - b.debut; });
  };
  // Ligne d'horaire (tuile d'heure, titre, étiquette) partagée par l'accueil et le pilotage UMONS.
  B.ligneEvenement = function (it, now) {
    var cls = "ev" + (it.journee ? "" : it.fin <= now ? " pass" : (it.debut <= now && now < it.fin ? " cur" : ""));
    var li = B.el("div", cls), h = B.el("span", "h");
    if (it.journee) h.textContent = "Jour"; else { h.appendChild(document.createTextNode(B.hm(it.debut))); if (it.fin > it.debut) h.appendChild(B.el("small", "", B.hm(it.fin))); }
    var t = B.el("span", "t", it.titre);
    if (it.detail || (it.liens && it.liens.length)) {
      var sm = B.el("small", "", it.detail ? it.detail : "");
      (it.liens || []).forEach(function (l, i) { if (it.detail || i) sm.appendChild(document.createTextNode(" · ")); sm.appendChild(B.lien(l.texte, l.url)); });
      t.appendChild(sm);
    }
    li.appendChild(h); li.appendChild(t);
    li.appendChild(B.el("span", "tag" + (it.type === "unif" ? " cu" : ""), it.tag));
    return li;
  };
  // Prochain élément de la journée (début dans le futur) et anneau « temps avant »
  B.bandeauTemps = function (items, now) {
    var suiv = items.filter(function (i) { return !i.journee && i.debut > now; }).sort(function (a, b) { return a.debut - b.debut; })[0];
    var zone = document.getElementById("temps");
    if (!zone) return suiv;
    zone.hidden = false;
    document.getElementById("heure").textContent = B.hFr(now);
    var reste = suiv ? (suiv.debut - now) / 60000 : 0;
    document.getElementById("reste").textContent = suiv ? B.dansMinutes(reste) : "plus rien aujourd'hui";
    var frac = suiv ? 1 - Math.min(reste, 180) / 180 : 1;
    document.getElementById("temps-arc").setAttribute("stroke-dasharray", (151 * frac).toFixed(1) + " 151");
    return suiv;
  };
})();
