/* reglages.js — deux vues dans la même page : « classe » (par défaut) et « réglages » (adresse …/pilotage/#reglages).
   Une seule page garde un seul état (couche prof, synchronisation) ; la roue dentée, la pastille de synchronisation et
   le bandeau de reprise ouvrent les réglages ; la flèche ou le bouton « précédent » y ramènent.
   Colonne « Cet appareil » : apparence (jour, soir, automatique), conservation des données (stockage persistant,
   conseil pour Brave), mode prof, données (export, import), classes et horaire. Texte inséré avec textContent. */
(function () {
  "use strict";
  var Pi = window.Pilotage = window.Pilotage || {};
  function $(s) { return document.querySelector(s); }
  function el(tag, cls, txt) { var n = document.createElement(tag); if (cls) n.className = cls; if (txt !== undefined) n.textContent = txt; return n; }
  function vider(n) { while (n.firstChild) n.removeChild(n.firstChild); }
  function bouton(txt, cls, f, id) { var b = el("button", cls || "btn", txt); b.type = "button"; if (id) b.id = id; b.addEventListener("click", f); return b; }

  /* ---------- vues ---------- */
  var demarre = false;
  function afficher() {
    var r = location.hash === "#reglages", c = $("#vue-classe"), g = $("#vue-reglages");
    if (!c || !g) return;
    c.hidden = r; g.hidden = !r;
    document.title = r ? "Réglages · Pilotage" : "Pilotage de classe";
    if (r) window.scrollTo(0, 0);
  }
  function ouvrir(nom) {
    if (nom === "reglages") { if (location.hash !== "#reglages") location.hash = "reglages"; }
    else if (location.hash) history.pushState(null, "", location.pathname + location.search);
    afficher();
    if (nom === "reglages") { var t = $("#fermer-reglages"); if (t) t.focus({ preventScroll: true }); }
  }
  function demarrer() {
    if (demarre) return; demarre = true;
    window.addEventListener("hashchange", afficher);
    window.addEventListener("popstate", afficher);
    var f = $("#fermer-reglages");
    if (f) f.addEventListener("click", function (e) { e.preventDefault(); ouvrir("classe"); });
    var o = $("#ouvrir-reglages");
    if (o) o.addEventListener("click", function (e) { e.preventDefault(); ouvrir("reglages"); });
    afficher();
  }
  Pi.vues = { demarrer: demarrer, ouvrir: ouvrir, afficher: afficher };

  /* ---------- colonne « Cet appareil » ---------- */
  function init(o) {
    var zone = $("#appareil-contenu");
    if (!zone || zone.getAttribute("data-pret")) return;
    zone.setAttribute("data-pret", "1");
    var S = o.sync, toast = o.toast || function () {}, ui = el("div", "appareil");
    zone.appendChild(ui);

    // apparence
    ui.appendChild(el("h3", "", "Apparence"));
    var seg = el("div", "segments"); seg.setAttribute("role", "group"); seg.setAttribute("aria-label", "Apparence");
    var NOMS = { jour: "Jour", soir: "Soir", auto: "Automatique" };
    Object.keys(NOMS).forEach(function (v) {
      var b = bouton(NOMS[v], "", function () { Pi.theme.choisir(v); majTheme(); }, "theme-" + v);
      seg.appendChild(b);
    });
    function majTheme() { var t = Pi.theme ? Pi.theme.lire() : "jour"; seg.querySelectorAll("button").forEach(function (b) { b.setAttribute("aria-pressed", String(b.id === "theme-" + t)); }); }
    ui.appendChild(seg); majTheme();
    ui.appendChild(el("p", "sub", "« Automatique » suit le mode sombre de l'appareil."));

    // conservation des données
    ui.appendChild(el("h3", "", "Conservation des données"));
    var persiste = el("span", "pastille"); persiste.id = "persistance";
    var lPers = el("div", "ligne"); lPers.appendChild(persiste);
    var bPers = bouton("Demander la conservation", "btn t", function () { demanderPersistance(true); });
    lPers.appendChild(bPers); ui.appendChild(lPers);
    var brave = el("div", "note cu"); brave.hidden = true; ui.appendChild(brave);
    function demanderPersistance(clic) {
      if (!(navigator.storage && navigator.storage.persisted)) { persiste.textContent = "Stockage persistant : non géré par ce navigateur"; bPers.hidden = true; return; }
      navigator.storage.persisted().then(function (ok) {
        if (ok || !navigator.storage.persist) return ok;
        if (!clic && !(S && S.estConfigure && S.estConfigure())) return ok;     // sans synchronisation : on ne demande rien d'office
        return navigator.storage.persist();
      }).then(function (ok) {
        persiste.textContent = ok ? "Stockage persistant accordé" : "Stockage persistant non accordé";
        persiste.className = "pastille " + (ok ? "ok" : "att");
        bPers.hidden = !!ok;
        if (clic && !ok) toast("Le navigateur refuse pour l'instant : la clé de synchronisation reste la sauvegarde sûre.");
      }, function () {});
    }
    demanderPersistance(false);
    if (navigator.brave && navigator.brave.isBrave) {
      navigator.brave.isBrave().then(function (oui) {
        if (!oui) return;
        brave.hidden = false;
        brave.appendChild(el("b", "", "Brave peut effacer les données de ce site à la fermeture. "));
        brave.appendChild(document.createTextNode("Réglages de Brave → Confidentialité et sécurité → Cookies et autres données des sites → « Sites autorisés à toujours utiliser des cookies » : ajoute "));
        brave.appendChild(el("b", "", location.origin));
        brave.appendChild(document.createTextNode(". Dans le bouclier de Brave pour ce site, la « navigation sans mémoire » doit être désactivée. Sinon, garde ta clé de synchronisation à portée."));
      }, function () {});
    }

    // mode prof
    ui.appendChild(el("h3", "", "Mode prof"));
    var lProf = el("div", "ligne"), pProf = el("span", "pastille"), bProf = bouton("Activer le mode prof", "btn t", function () {
      if (o.etat && o.etat.activerModeProf()) { toast("Mode prof activé sur cet appareil"); majProf(); if (o.rendre) o.rendre(); }
    });
    lProf.appendChild(pProf); lProf.appendChild(bProf); ui.appendChild(lProf);
    function majProf() {
      var on = !!(o.etat && o.etat.modeProf());
      pProf.textContent = on ? "Activé sur cet appareil" : "Désactivé : les cours s'ouvrent sans la couche prof";
      pProf.className = "pastille " + (on ? "ok" : "att");
      bProf.hidden = on || !o.etat;
    }
    majProf();

    // données
    ui.appendChild(el("h3", "", "Données de cet appareil"));
    var compte = el("p", "sub"); ui.appendChild(compte);
    var lDon = el("div", "ligne");
    lDon.appendChild(bouton("Exporter l'état", "btn t", function () { var b = $("#exporter"); if (b) b.click(); }));
    lDon.appendChild(bouton("Importer un fichier", "btn t", function () { var b = $("#importer"); if (b) b.click(); }));
    ui.appendChild(lDon);
    function majCompte() {
      var n = o.etat ? o.etat.evenements().length : 0, att = S && S.enAttente ? S.enAttente() : 0;
      compte.textContent = "Journal : " + n + " événement(s)" + (S && S.estConfigure && S.estConfigure() ? " · " + att + " en attente d'envoi" : "") + ".";
    }
    majCompte();
    if (S && S.abonner) S.abonner(function () { majCompte(); majProf(); });
    if (o.etat && o.etat.abonner) o.etat.abonner(majCompte);

    // classes et horaire
    if (o.config) {
      ui.appendChild(el("h3", "", "Classes et horaire"));
      var l = el("div", "sub");
      o.config.classes.forEach(function (c) {
        var cr = o.config.creneaux.filter(function (s) { return s.classe === c.code; }).map(function (s) { return s.jour + " " + s.debut.replace(":", "h"); });
        l.appendChild(el("div", "", c.code + " · " + (cr.length ? cr.join(", ") : "aucun créneau")));
      });
      ui.appendChild(l);
      ui.appendChild(el("p", "sub", "À modifier dans config/pilotage.json du dépôt privé (ou config.json du site), puis recharger la page."));
    }
    ui.appendChild(el("p", "sub", "Mode d'emploi complet : typweb/doc/GUIDE.md, section « Pilotage »."));
    var sub = $("#appareil-sub");
    if (sub && S && S.infos) { var inf = S.infos(); sub.textContent = inf.appareil ? "« " + inf.appareil + " »" : "pas encore nommé"; if (S.abonner) S.abonner(function () { var i = S.infos(); sub.textContent = i.appareil ? "« " + i.appareil + " »" : "pas encore nommé"; }); }
  }

  Pi.reglages = { init: init };
})();
