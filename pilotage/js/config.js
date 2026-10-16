/* config.js — validation de config.json et accès à la configuration.
   La source de la configuration (fichier du site aujourd'hui, dépôt privé en P5) est isolée dans
   `sourceFichier` : changer de source = fournir un autre objet { charger(): Promise<texte|objet> }. */
(function (root, fabrique) {
  var m = fabrique(typeof require === "function" ? require("./outils.js") : root.Pilotage.outils);
  if (typeof module === "object" && module.exports) module.exports = m;
  else { root.Pilotage = root.Pilotage || {}; root.Pilotage.config = m; }
})(typeof window !== "undefined" ? window : this, function (O) {
  "use strict";
  var HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
  var NIVEAUX = ["5e", "6e"];

  function estObjet(x) { return x && typeof x === "object" && !Array.isArray(x); }
  function liste(x) { return Array.isArray(x) ? x : null; }

  // Renvoie { ok, erreurs: [texte lisible], config }. Ne lève jamais d'exception.
  function valider(brut) {
    var err = [], cfg = brut;
    if (typeof brut === "string") {
      try { cfg = JSON.parse(brut); }
      catch (e) { return { ok: false, erreurs: ["config.json n'est pas un JSON valide (" + e.message + "). Cherche une virgule ou un guillemet en trop ou manquant."], config: null }; }
    }
    if (!estObjet(cfg)) return { ok: false, erreurs: ["config.json doit contenir un objet { … }."], config: null };

    var fuseau = cfg.fuseau === undefined ? O.FUSEAU : cfg.fuseau;
    try { new Intl.DateTimeFormat("fr", { timeZone: fuseau }); }
    catch (e) { err.push("fuseau : « " + fuseau + " » n'est pas un fuseau horaire connu (exemple : Europe/Brussels)."); fuseau = O.FUSEAU; }

    var classes = liste(cfg.classes), codes = [];
    if (!classes || !classes.length) err.push("classes : liste vide ou absente (au moins une classe est nécessaire).");
    else classes.forEach(function (c, i) {
      var p = "classes[" + i + "]";
      if (!estObjet(c)) { err.push(p + " : un objet { code, niveau, effectif, … } est attendu."); return; }
      if (typeof c.code !== "string" || !c.code.trim()) { err.push(p + ".code : texte non vide attendu (exemple : « 5TTy »)."); return; }
      if (codes.indexOf(c.code) >= 0) err.push(p + ".code : « " + c.code + " » apparaît deux fois.");
      codes.push(c.code);
      if (NIVEAUX.indexOf(c.niveau) < 0) err.push(p + ".niveau : « " + c.niveau + " » invalide (attendu : " + NIVEAUX.join(" ou ") + ").");
      if (!(Number.isInteger(c.effectif) && c.effectif > 0)) err.push(p + ".effectif : entier positif attendu (reçu : " + JSON.stringify(c.effectif) + ").");
      var cours = c.cours === undefined ? [] : liste(c.cours), uaas = [];
      if (!cours) err.push(p + ".cours : liste attendue.");
      else cours.forEach(function (k, j) {
        var q = p + ".cours[" + j + "]";
        if (!estObjet(k)) { err.push(q + " : un objet { uaa, titre, url, index, classe } est attendu."); return; }
        ["uaa", "titre", "url", "index"].forEach(function (champ) {
          if (typeof k[champ] !== "string" || !k[champ].trim()) err.push(q + "." + champ + " : texte non vide attendu.");
        });
        // « classe » (banque publiée avec le site) est facultatif : la banque est lue dans le dépôt privé (banques/<UAA>/)
        if (k.classe !== undefined && (typeof k.classe !== "string" || !k.classe.trim())) err.push(q + ".classe : texte non vide attendu (ou champ absent).");
        if (typeof k.url === "string" && !/^https?:\/\/.+\/$/.test(k.url)) err.push(q + ".url : adresse complète terminée par « / » attendue (exemple : https://qlambotte.github.io/limites-cours/).");
        if (typeof k.uaa === "string") { if (uaas.indexOf(k.uaa) >= 0) err.push(q + ".uaa : « " + k.uaa + " » apparaît deux fois."); uaas.push(k.uaa); }
      });
      if (c.coursEnCours !== undefined && c.coursEnCours !== null && uaas.indexOf(c.coursEnCours) < 0)
        err.push(p + ".coursEnCours : « " + c.coursEnCours + " » n'est pas dans la liste des cours de la classe (" + (uaas.join(", ") || "aucun cours") + ").");
    });

    var creneaux = liste(cfg.creneaux);
    if (!creneaux) err.push("creneaux : liste attendue.");
    else creneaux.forEach(function (s, i) {
      var p = "creneaux[" + i + "]";
      if (!estObjet(s)) { err.push(p + " : un objet { jour, debut, fin, classe, local } est attendu."); return; }
      if (O.JOURS.indexOf(s.jour) < 1) err.push(p + ".jour : « " + s.jour + " » invalide (attendu : lundi, mardi, … samedi).");
      if (!HHMM.test(s.debut || "")) err.push(p + ".debut : heure au format HH:MM attendue (reçu : " + JSON.stringify(s.debut) + ").");
      if (!HHMM.test(s.fin || "")) err.push(p + ".fin : heure au format HH:MM attendue (reçu : " + JSON.stringify(s.fin) + ").");
      if (HHMM.test(s.debut || "") && HHMM.test(s.fin || "") && O.minutes(s.debut) >= O.minutes(s.fin)) err.push(p + " : le début (" + s.debut + ") doit précéder la fin (" + s.fin + ").");
      if (codes.indexOf(s.classe) < 0) err.push(p + ".classe : « " + s.classe + " » n'existe pas dans classes (classes connues : " + codes.join(", ") + ").");
      if (typeof s.local !== "string" || !s.local.trim()) err.push(p + ".local : texte non vide attendu.");
    });

    var conges = cfg.conges === undefined ? [] : liste(cfg.conges);
    if (!conges) err.push("conges : liste attendue.");
    else conges.forEach(function (c, i) {
      var p = "conges[" + i + "]";
      if (typeof c === "string") c = { du: c, au: c };
      if (!estObjet(c)) { err.push(p + " : une date « AAAA-MM-JJ » ou { du, au, motif } est attendue."); return; }
      if (!O.dateValide(c.du)) err.push(p + ".du : date AAAA-MM-JJ valide attendue (reçu : " + JSON.stringify(c.du) + ").");
      if (!O.dateValide(c.au)) err.push(p + ".au : date AAAA-MM-JJ valide attendue (reçu : " + JSON.stringify(c.au) + ").");
      if (O.dateValide(c.du) && O.dateValide(c.au) && c.du > c.au) err.push(p + " : « du » (" + c.du + ") est après « au » (" + c.au + ").");
    });

    var interros = cfg.interros === undefined ? [] : liste(cfg.interros);
    if (!interros) err.push("interros : liste attendue.");
    else interros.forEach(function (it, i) {
      var p = "interros[" + i + "]";
      if (!estObjet(it)) { err.push(p + " : un objet { date, classe, uaa, type } est attendu."); return; }
      if (!O.dateValide(it.date)) err.push(p + ".date : date AAAA-MM-JJ valide attendue (reçu : " + JSON.stringify(it.date) + ").");
      if (codes.indexOf(it.classe) < 0) err.push(p + ".classe : « " + it.classe + " » n'existe pas dans classes (" + codes.join(", ") + ").");
      if (typeof it.uaa !== "string" || !it.uaa.trim()) err.push(p + ".uaa : texte non vide attendu.");
      if (typeof it.type !== "string" || !it.type.trim()) err.push(p + ".type : texte non vide attendu (formatif, certificatif, bilan…).");
    });

    var format = cfg.format === undefined ? {} : cfg.format;
    if (!estObjet(format)) { err.push("format : un objet est attendu."); format = {}; }
    else if (format.devoirs !== undefined && typeof format.devoirs !== "string") err.push("format.devoirs : texte attendu (exemple : « Exercice {num}[ : {titre}] »).");

    if (err.length) return { ok: false, erreurs: err, config: null };
    return { ok: true, erreurs: [], config: {
      fuseau: fuseau, classes: classes, creneaux: creneaux, conges: conges.map(function (c) { return typeof c === "string" ? { du: c, au: c } : c; }),
      interros: interros, format: { devoirs: format.devoirs || "Exercice {num}[ : {titre}]" }
    } };
  }

  function classe(config, code) {
    return config.classes.filter(function (c) { return c.code === code; })[0] || null;
  }
  function coursEnCours(c) {
    if (!c || !c.cours || !c.cours.length) return null;
    return c.cours.filter(function (k) { return k.uaa === c.coursEnCours; })[0] || null;
  }
  function adresse(cours, chemin) { return new URL(chemin, cours.url).href; }

  // Source par défaut : config.json à côté de la page. Une copie est gardée sur l'appareil
  // (utile si le service worker est indisponible).
  var CLE_COPIE = "pilotage.config.copie";
  // P5 : si la synchronisation est configurée, la copie du dépôt privé (config/pilotage.json) l'emporte quand elle est valide
  // (modifiable depuis le PC) ; hors ligne, la dernière copie du dépôt gardée sur l'appareil sert ; sinon config.json du site.
  // `origine` : "depot" | "depot-copie" | "site" | "copie" ; `refus` : erreurs de la copie du dépôt si elle a été écartée.
  function depotAvant() {
    var S = typeof window !== "undefined" ? window.typwebSync : null;
    if (!S || !S.estConfigure || !S.estConfigure()) return Promise.resolve(null);
    var local = function () { var t = S.configLocale(); return t ? { texte: t, origine: "depot-copie" } : null; };
    var i = S.infos();
    if (!i.jeton || i.verrouille || (typeof navigator !== "undefined" && navigator.onLine === false)) return Promise.resolve(local());
    var delai = new Promise(function (res) { setTimeout(function () { res(null); }, 4000); });
    var essai = S.configDepot().then(function (r) { return r && r.texte ? { texte: r.texte, origine: "depot" } : null; }, function () { return null; });
    return Promise.race([essai, delai]).then(function (r) { return r || local(); });
  }
  var sourceFichier = {
    nom: "config.json", origine: "site", refus: null,
    charger: function () {
      return depotAvant().then(function (d) {
        sourceFichier.refus = null;
        if (d) {
          var v = valider(d.texte);
          if (v.ok) { try { localStorage.setItem(CLE_COPIE, d.texte); } catch (e) {} sourceFichier.origine = d.origine; return d.texte; }
          sourceFichier.refus = v.erreurs;                      // copie du dépôt invalide : on garde la configuration du site
        }
        return chargerSite();
      });
    }
  };
  function chargerSite() {
    sourceFichier.origine = "site";
    return (function () {
      return fetch("config.json", { cache: "no-cache" }).then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.text();
      }).then(function (txt) {
        try { localStorage.setItem(CLE_COPIE, txt); } catch (e) {}
        return txt;
      }, function (e) {
        var copie = null;
        try { copie = localStorage.getItem(CLE_COPIE); } catch (e2) {}
        if (copie) { sourceFichier.origine = "copie"; return copie; }
        throw e;
      });
    })();
  }
  return { valider: valider, classe: classe, coursEnCours: coursEnCours, adresse: adresse, sourceFichier: sourceFichier };
});
