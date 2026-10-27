/* outils.js — dates (fuseau explicite), générateur pseudo-aléatoire à graine, tirage pondéré.
   Sans dépendance ; chargé par le navigateur (window.Pilotage.outils) et par node (tests). */
(function (root, fabrique) {
  var m = fabrique();
  if (typeof module === "object" && module.exports) module.exports = m;
  else { root.Pilotage = root.Pilotage || {}; root.Pilotage.outils = m; }
})(typeof window !== "undefined" ? window : this, function () {
  "use strict";
  var JOURS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
  var FUSEAU = "Europe/Brussels";
  var fmts = {};

  function p2(n) { return (n < 10 ? "0" : "") + n; }

  // Composants de l'instant `date` (Date ou ms) dans le fuseau donné.
  function local(date, fuseau) {
    fuseau = fuseau || FUSEAU;
    var f = fmts[fuseau] || (fmts[fuseau] = new Intl.DateTimeFormat("en-GB", {
      timeZone: fuseau, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit"
    }));
    var o = {};
    f.formatToParts(date instanceof Date ? date : new Date(date)).forEach(function (p) { o[p.type] = p.value; });
    var y = +o.year, mo = +o.month, d = +o.day;
    return { y: y, m: mo, d: d, h: +o.hour, min: +o.minute, ymd: y + "-" + p2(mo) + "-" + p2(d),
             jour: new Date(Date.UTC(y, mo - 1, d)).getUTCDay(), minutes: (+o.hour) * 60 + (+o.minute) };
  }
  function jourDe(t, fuseau) { return local(t, fuseau).ymd; }

  function versUTC(ymd) { var a = ymd.split("-"); return Date.UTC(+a[0], +a[1] - 1, +a[2]); }
  function ajouterJours(ymd, n) {
    var d = new Date(versUTC(ymd) + n * 86400000);
    return d.getUTCFullYear() + "-" + p2(d.getUTCMonth() + 1) + "-" + p2(d.getUTCDate());
  }
  function ecartJours(a, b) { return Math.round((versUTC(b) - versUTC(a)) / 86400000); }   // b − a
  function jourSemaine(ymd) { return new Date(versUTC(ymd)).getUTCDay(); }
  function minutes(hhmm) { var a = hhmm.split(":"); return (+a[0]) * 60 + (+a[1]); }
  function dateValide(ymd) {
    if (typeof ymd !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return false;
    return ajouterJours(ymd, 0) === ymd;
  }
  function heureFr(hhmm) { var a = hhmm.split(":"); return (+a[0]) + "h" + a[1]; }
  function dateFr(ymd) { var a = ymd.split("-"); return a[2] + "/" + a[1]; }

  // ----- hasard reproductible -----
  function hachage(s) {                       // xmur3
    var h = 1779033703 ^ s.length, i;
    for (i = 0; i < s.length; i++) { h = Math.imul(h ^ s.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
    h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^ (h >>> 16)) >>> 0;
  }
  function generateur(graine) {               // mulberry32 ; graine : texte ou entier
    var a = typeof graine === "number" ? graine >>> 0 : hachage(String(graine));
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  // Un élément de `items`, avec une probabilité proportionnelle à poids[i] ; null si vide.
  function pondere(rng, items, poids) {
    if (!items.length) return null;
    var tot = 0, i;
    for (i = 0; i < items.length; i++) tot += poids[i];
    if (!(tot > 0)) return items[Math.floor(rng() * items.length)];
    var x = rng() * tot;
    for (i = 0; i < items.length; i++) { x -= poids[i]; if (x < 0) return items[i]; }
    return items[items.length - 1];
  }
  // Texte brut d'un énoncé (Markdown + $…$) pour un aperçu court.
  function apercu(txt, max) {
    var s = String(txt || "").replace(/\$/g, "").replace(/\\lim(?:\\limits)?_\{x \\overset\{([<>])\}\{\\to\} ([^}]*)\}/g, "lim(x →$1 $2)").replace(/\\lim_\{([^}]*)\}/g, "lim($1)").replace(/\^\{?-\}?/g, "⁻").replace(/\^\{?\+\}?/g, "⁺")
      .replace(/\\(sqrt)\{([^}]*)\}/g, "√($2)").replace(/\\mathbb\{R\}/g, "ℝ").replace(/\\setminus/g, "∖").replace(/\\cdot/g, "·").replace(/\\(frac|dfrac)\{([^}]*)\}\{([^}]*)\}/g, "($2)/($3)")
      .replace(/\\(infty|oo)/g, "∞").replace(/\\to|\\rightarrow/g, "→").replace(/\\[a-zA-Z]+/g, "")
      .replace(/[{}]/g, "").replace(/\s+/g, " ").trim();
    max = max || 90;
    return s.length > max ? s.slice(0, max - 1) + "…" : s;
  }
  return { JOURS: JOURS, FUSEAU: FUSEAU, local: local, jourDe: jourDe, ajouterJours: ajouterJours, ecartJours: ecartJours,
           jourSemaine: jourSemaine, minutes: minutes, dateValide: dateValide, heureFr: heureFr, dateFr: dateFr,
           generateur: generateur, hachage: hachage, pondere: pondere, apercu: apercu, p2: p2 };
});
