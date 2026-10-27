/* ics.js — lecture d'un fichier iCalendar (.ics exporté d'Outlook ou de HPlanning) et développement des
   événements récurrents sur une fenêtre de dates. Logique pure, sans dépendance : navigateur (Board.ics) et node (tests).
   Heures « murales » (sans fuseau, ou avec un TZID) : converties avec Intl ; sans fuseau connu : Europe/Brussels. */
(function (root, fabrique) {
  var m = fabrique();
  if (typeof module === "object" && module.exports) module.exports = m;
  else { root.Board = root.Board || {}; root.Board.ics = m; }
})(typeof window !== "undefined" ? window : this, function () {
  "use strict";
  var FUSEAU = "Europe/Brussels", JMS = 86400000, MAX_ITER = 4000;
  var WINDOWS = { "Romance Standard Time": "Europe/Brussels", "W. Europe Standard Time": "Europe/Berlin",
    "Central Europe Standard Time": "Europe/Budapest", "Central European Standard Time": "Europe/Warsaw",
    "GMT Standard Time": "Europe/London", "UTC": "UTC", "Greenwich Standard Time": "Atlantic/Reykjavik" };
  var JOURS = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
  var fmts = {};

  function p2(n) { return (n < 10 ? "0" : "") + n; }
  function ymd(y, mo, d) { return y + "-" + p2(mo) + "-" + p2(d); }
  function zoneValide(z) { try { new Intl.DateTimeFormat("en-GB", { timeZone: z }); return true; } catch (e) { return false; } }
  function zoneDe(tzid) {
    if (!tzid) return FUSEAU;
    tzid = String(tzid).replace(/^"|"$/g, "");
    if (WINDOWS[tzid]) return WINDOWS[tzid];
    return zoneValide(tzid) ? tzid : FUSEAU;
  }
  function fmt(z) {
    return fmts[z] || (fmts[z] = new Intl.DateTimeFormat("en-GB", { timeZone: z, hourCycle: "h23", year: "numeric", month: "2-digit",
      day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }));
  }
  // Heure murale (y, mo, d, h, mi, s) dans la zone → instant (ms UTC).
  function murale(y, mo, d, h, mi, s, zone) {
    var visee = Date.UTC(y, mo - 1, d, h, mi, s || 0), t = visee, i, o;
    for (i = 0; i < 3; i++) {
      o = {};
      fmt(zone).formatToParts(new Date(t)).forEach(function (p) { o[p.type] = p.value; });
      t += visee - Date.UTC(+o.year, +o.month - 1, +o.day, +o.hour, +o.minute, +o.second);
    }
    return t;
  }
  function local(ms, zone) {
    var o = {};
    fmt(zone || FUSEAU).formatToParts(new Date(ms)).forEach(function (p) { o[p.type] = p.value; });
    return { y: +o.year, mo: +o.month, d: +o.day, h: +o.hour, mi: +o.minute, s: +o.second, ymd: ymd(+o.year, +o.month, +o.day) };
  }

  /* ---------- lignes ---------- */
  function lignes(texte) {
    return String(texte).replace(/\r\n?/g, "\n").replace(/\n[ \t]/g, "").split("\n").filter(function (l) { return l !== ""; });
  }
  function decouper(l) {                       // NOM;PARAM=…:valeur
    var i, guillemets = false, deuxPoints = -1;
    for (i = 0; i < l.length; i++) {
      var c = l.charAt(i);
      if (c === '"') guillemets = !guillemets;
      else if (c === ":" && !guillemets) { deuxPoints = i; break; }
    }
    if (deuxPoints < 0) return null;
    var tete = l.slice(0, deuxPoints), valeur = l.slice(deuxPoints + 1), morceaux = tete.split(";"), params = {};
    morceaux.slice(1).forEach(function (p) { var k = p.indexOf("="); if (k > 0) params[p.slice(0, k).toUpperCase()] = p.slice(k + 1); });
    return { nom: morceaux[0].toUpperCase(), params: params, valeur: valeur };
  }
  function texteDe(v) { return String(v).replace(/\\n/gi, "\n").replace(/\\,/g, ",").replace(/\;/g, ";").replace(/\\\\/g, "\\"); }

  // Date/heure iCalendar → { journee, ms, ymd, mur, zone } ; null si illisible.
  function dateHeure(valeur, params) {
    var v = String(valeur).trim(), a = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(v);
    if (!a) return null;
    var y = +a[1], mo = +a[2], d = +a[3];
    if (a[4] === undefined || (params && params.VALUE === "DATE")) {
      return { journee: true, ms: murale(y, mo, d, 0, 0, 0, FUSEAU), ymd: ymd(y, mo, d), mur: { y: y, mo: mo, d: d, h: 0, mi: 0 }, zone: FUSEAU };
    }
    var h = +a[4], mi = +a[5], s = +(a[6] || 0), zone = a[7] ? "UTC" : zoneDe(params && params.TZID), ms = murale(y, mo, d, h, mi, s, zone);
    var l = local(ms, FUSEAU);                 // jour et heure affichés : toujours à Bruxelles
    return { journee: false, ms: ms, ymd: l.ymd, mur: { y: y, mo: mo, d: d, h: h, mi: mi }, zone: zone };
  }
  function duree(v) {                           // PT1H30M, P1D → ms
    var a = /^P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(String(v).trim());
    if (!a) return 0;
    return ((+a[1] || 0) * 7 + (+a[2] || 0)) * JMS + ((+a[3] || 0) * 3600 + (+a[4] || 0) * 60 + (+a[5] || 0)) * 1000;
  }
  function regle(v) {
    var r = {};
    String(v).split(";").forEach(function (p) { var k = p.indexOf("="); if (k > 0) r[p.slice(0, k).toUpperCase()] = p.slice(k + 1); });
    return {
      freq: (r.FREQ || "").toUpperCase(), intervalle: Math.max(+r.INTERVAL || 1, 1), compte: r.COUNT ? +r.COUNT : 0, jusqua: r.UNTIL || null,
      parJour: r.BYDAY ? r.BYDAY.split(",").map(function (x) { var b = /^([+-]?\d+)?(SU|MO|TU|WE|TH|FR|SA)$/.exec(x.trim().toUpperCase()); return b ? { n: b[1] ? +b[1] : 0, j: JOURS[b[2]] } : null; }).filter(Boolean) : [],
      parJourMois: r.BYMONTHDAY ? r.BYMONTHDAY.split(",").map(Number) : []
    };
  }
  function premierUrl(t) {
    var liens = String(t || "").match(/https?:\/\/[^\s<>"')\]\\]+/g) || [];
    var teams = liens.filter(function (u) { return /teams\.microsoft\.com|teams\.live\.com/i.test(u); })[0];
    return teams || liens[0] || "";
  }

  /* ---------- analyse ---------- */
  // → liste d'événements « bruts » (avec règle de récurrence éventuelle).
  function analyser(texte) {
    var L = lignes(texte), evts = [], cur = null, alarme = 0, i, p, bruts = [];
    for (i = 0; i < L.length; i++) {
      var U = L[i].toUpperCase();
      if (U === "BEGIN:VEVENT") { cur = { exd: [], cats: [] }; continue; }
      if (U === "END:VEVENT") { if (cur) bruts.push(cur); cur = null; continue; }
      if (!cur) continue;
      if (U === "BEGIN:VALARM") { alarme++; continue; }
      if (U === "END:VALARM") { alarme--; continue; }
      if (alarme > 0) continue;
      p = decouper(L[i]);
      if (!p) continue;
      switch (p.nom) {
        case "UID": cur.uid = p.valeur.trim(); break;
        case "SUMMARY": cur.titre = texteDe(p.valeur).trim(); break;
        case "LOCATION": cur.lieu = texteDe(p.valeur).trim(); break;
        case "DESCRIPTION": cur.desc = texteDe(p.valeur); break;
        case "URL": cur.url = p.valeur.trim(); break;
        case "STATUS": cur.annule = /CANCELLED/i.test(p.valeur); break;
        case "PRIORITY": cur.prio = +p.valeur || 0; break;
        case "CATEGORIES": cur.cats = cur.cats.concat(texteDe(p.valeur).split(",").map(function (s) { return s.trim(); }).filter(Boolean)); break;
        case "DTSTART": cur.deb = dateHeure(p.valeur, p.params); break;
        case "DTEND": cur.fin = dateHeure(p.valeur, p.params); break;
        case "DURATION": cur.dur = duree(p.valeur); break;
        case "RRULE": cur.rr = regle(p.valeur); break;
        case "RECURRENCE-ID": cur.recId = dateHeure(p.valeur, p.params); break;
        case "EXDATE": p.valeur.split(",").forEach(function (v) { var d = dateHeure(v, p.params); if (d) cur.exd.push(d); }); break;
      }
    }
    bruts.forEach(function (e) {
      if (!e.deb) return;
      var fin = e.fin ? e.fin.ms : (e.dur ? e.deb.ms + e.dur : (e.deb.journee ? e.deb.ms + JMS : e.deb.ms));
      evts.push({ uid: e.uid || ("sans-uid-" + evts.length), titre: e.titre || "(sans titre)", lieu: e.lieu || "", url: e.url || premierUrl(e.desc),
        cats: e.cats, prio: e.prio || 0, annule: !!e.annule, deb: e.deb, fin: fin, rr: e.rr || null, exd: e.exd, recId: e.recId || null });
    });
    return evts;
  }

  /* ---------- récurrences ---------- */
  function ajJ(o, n) { var d = new Date(Date.UTC(o.y, o.mo - 1, o.d + n)); return { y: d.getUTCFullYear(), mo: d.getUTCMonth() + 1, d: d.getUTCDate() }; }
  function dow(o) { return new Date(Date.UTC(o.y, o.mo - 1, o.d)).getUTCDay(); }
  function jMois(y, mo) { return new Date(Date.UTC(y, mo, 0)).getUTCDate(); }
  function nieme(y, mo, n, j) {                // n-ième jour de semaine j du mois (n<0 : depuis la fin) → jour du mois ou 0
    var nb = jMois(y, mo), premier = new Date(Date.UTC(y, mo - 1, 1)).getUTCDay(), jours = [], d;
    for (d = 1 + ((j - premier + 7) % 7); d <= nb; d += 7) jours.push(d);
    return n > 0 ? (jours[n - 1] || 0) : (jours[jours.length + n] || 0);
  }
  // Dates (y, mo, d) des occurrences, en heure murale, jusqu'à `limite` (ms UTC) : tableau de { y, mo, d }.
  function dates(e, limite) {
    var r = e.rr, b = e.deb.mur, sortie = [], k, i, c;
    var jusqua = null;
    if (r.jusqua) { var u = dateHeure(r.jusqua, {}); jusqua = u ? (u.journee ? u.ms + JMS - 1 : u.ms) : null; }
    function ms(o) { return murale(o.y, o.mo, o.d, b.h, b.mi, 0, e.deb.zone); }
    function ajouter(o) {                       // false : fin de la série
      var t = ms(o);
      if (t < e.deb.ms) return true;
      if (jusqua !== null && t > jusqua) return false;
      if (t > limite) return false;
      sortie.push(o);
      return !(r.compte && sortie.length >= r.compte);
    }
    if (r.freq === "DAILY") {
      for (k = 0; k < MAX_ITER; k++) if (!ajouter(ajJ(b, k * r.intervalle))) break;
    } else if (r.freq === "WEEKLY") {
      var ws = ajJ(b, -((dow(b) + 6) % 7)), jours = r.parJour.length ? r.parJour.map(function (x) { return x.j; }) : [dow(b)];
      jours = jours.map(function (j) { return (j + 6) % 7; }).sort(function (x, y) { return x - y; });
      outer: for (k = 0; k < MAX_ITER; k++) {
        for (i = 0; i < jours.length; i++) if (!ajouter(ajJ(ws, k * 7 * r.intervalle + jours[i]))) break outer;
        if (ms(ajJ(ws, k * 7 * r.intervalle)) > limite) break;
      }
    } else if (r.freq === "MONTHLY" || r.freq === "YEARLY") {
      var pas = r.freq === "MONTHLY" ? r.intervalle : 12 * r.intervalle;
      outer2: for (k = 0; k < MAX_ITER; k++) {
        var mo0 = b.mo - 1 + k * pas, y = b.y + Math.floor(mo0 / 12), mo = (mo0 % 12) + 1, ds = [];
        if (r.freq === "YEARLY" || (!r.parJour.length && !r.parJourMois.length)) ds = [b.d];
        r.parJourMois.forEach(function (d) { ds.push(d > 0 ? d : jMois(y, mo) + d + 1); });
        if (r.freq === "MONTHLY") r.parJour.forEach(function (x) { if (x.n) { var d = nieme(y, mo, x.n, x.j); if (d) ds.push(d); } });
        ds = ds.filter(function (d) { return d >= 1 && d <= jMois(y, mo); }).sort(function (a, c2) { return a - c2; });
        for (i = 0; i < ds.length; i++) if (!ajouter({ y: y, mo: mo, d: ds[i] })) break outer2;
        if (murale(y, mo, 1, 0, 0, 0, e.deb.zone) > limite) break;
      }
    }
    return sortie;
  }

  /* ---------- développement sur une fenêtre ---------- */
  // opts : { de, a } en ms UTC (instants). → [{ id, debut, fin, journee, jour, titre, lieu, url, cats, prio }] triés.
  function developper(evts, opts) {
    var de = opts.de, a = opts.a, sortie = [];
    var surcharges = {};
    evts.forEach(function (e) { if (e.recId) (surcharges[e.uid] = surcharges[e.uid] || []).push(e.recId.ms); });
    function inst(e, debut, fin) {
      var jour = local(debut, FUSEAU).ymd;
      return { id: e.uid + "@" + debut, debut: debut, fin: Math.max(fin, debut), journee: e.deb.journee, jour: jour, titre: e.titre, lieu: e.lieu,
               url: e.url, cats: e.cats.slice(), prio: e.prio };
    }
    evts.forEach(function (e) {
      if (e.annule) return;
      var dur = e.fin - e.deb.ms;
      if (!e.rr || e.recId || !e.rr.freq) {
        if ((e.fin > de && e.deb.ms <= a) || (e.fin === e.deb.ms && e.deb.ms >= de && e.deb.ms <= a)) sortie.push(inst(e, e.deb.ms, e.fin));
        return;
      }
      var exd = e.exd.map(function (x) { return x.journee ? x.ymd : x.ms; }), over = surcharges[e.uid] || [];
      dates(e, a).forEach(function (o) {
        var debut = murale(o.y, o.mo, o.d, e.deb.mur.h, e.deb.mur.mi, 0, e.deb.zone), fin = debut + dur;
        if (e.deb.journee) { debut = murale(o.y, o.mo, o.d, 0, 0, 0, FUSEAU); fin = debut + dur; }
        if (fin < de || debut > a) return;
        if (exd.indexOf(e.deb.journee ? ymd(o.y, o.mo, o.d) : debut) >= 0 || over.indexOf(debut) >= 0) return;
        sortie.push(inst(e, debut, fin));
      });
    });
    sortie.sort(function (x, y) { return x.debut - y.debut || (x.titre < y.titre ? -1 : 1); });
    return sortie;
  }
  // Tout-en-un : texte .ics → événements développés sur [de, a].
  function lire(texte, opts) { return developper(analyser(texte), opts); }
  return { analyser: analyser, developper: developper, lire: lire, murale: murale, local: local, zoneDe: zoneDe, FUSEAU: FUSEAU };
});
