/* ev.js — lecture du journal d'événements (typweb.prof.v1, schéma 1 ou 2), fonctions pures.
   Mêmes règles que prof.js (couche prof) : état = dernier événement vu/annule par (classe, élément), dans l'ordre (t, d, id).
   Ne lit ni n'écrit aucun stockage : reçoit le tableau d'événements. */
(function (root, fabrique) {
  var m = fabrique(typeof require === "function" ? require("./outils.js") : root.Pilotage.outils);
  if (typeof module === "object" && module.exports) module.exports = m;
  else { root.Pilotage = root.Pilotage || {}; root.Pilotage.ev = m; }
})(typeof window !== "undefined" ? window : this, function (O) {
  "use strict";

  // Ordre total (t, appareil, id), identique à prof.js : le plus grand gagne, quel que soit l'ordre du tableau (P5).
  function cmpEv(a, b) {
    var da = String(a.d || ""), db = String(b.d || "");
    return a.t - b.t || (da < db ? -1 : da > db ? 1 : 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  }
  // { élément: { t, jour } } des éléments « vus » ; si `avant` (ms) : état reconstitué à cet instant.
  function etat(ev, classe, fuseau, avant) {
    var dernier = {}, out = {};
    (ev || []).forEach(function (e) {
      if (!e || e.c !== classe || (e.a !== "vu" && e.a !== "annule")) return;
      if (avant !== undefined && !(e.t < avant)) return;
      if (!dernier[e.el] || cmpEv(e, dernier[e.el]) > 0) dernier[e.el] = e;
    });
    Object.keys(dernier).forEach(function (el) {
      if (dernier[el].a === "vu") out[el] = { t: dernier[el].t, jour: O.jourDe(dernier[el].t, fuseau) };
    });
    return out;
  }
  function dansCours(id, uaa) { return !uaa || id.indexOf(uaa + ".") === 0; }
  function dernier(etatObj, uaa, jourMax) {            // { el, t } | null ; jourMax : exclu
    var best = null;
    Object.keys(etatObj).forEach(function (el) {
      if (!dansCours(el, uaa)) return;
      if (jourMax && !(etatObj[el].jour < jourMax)) return;
      if (!best || etatObj[el].t >= best.t) best = { el: el, t: etatObj[el].t, jour: etatObj[el].jour };
    });
    return best;
  }
  function seance(etatObj, jour, uaa) {                // ids vus ce jour-là, dans l'ordre du marquage
    return Object.keys(etatObj).filter(function (el) { return etatObj[el].jour === jour && dansCours(el, uaa); })
      .sort(function (a, b) { return etatObj[a].t - etatObj[b].t; });
  }
  function jours(etatObj, uaa) {                       // jours distincts avec marques, croissants
    var s = {};
    Object.keys(etatObj).forEach(function (el) { if (dansCours(el, uaa)) s[etatObj[el].jour] = 1; });
    return Object.keys(s).sort();
  }
  function uaaDe(id) { var i = String(id).indexOf("."); return i > 0 ? id.slice(0, i) : ""; }
  function uaasVues(etatObj) {
    var s = {};
    Object.keys(etatObj).forEach(function (el) { var u = uaaDe(el); if (u) s[u] = 1; });
    return Object.keys(s).sort();
  }

  // Échauffements de la classe : un par session (`sid`), le dernier événement gagne. Chronologique.
  function echauffements(ev, classe, fuseau) {
    var parSid = {};
    (ev || []).forEach(function (e) {
      if (e && e.c === classe && e.a === "echauffement" && Array.isArray(e.items)) parSid[e.sid || e.id] = e;
    });
    return Object.keys(parSid).map(function (k) {
      var e = parSid[k];
      return { sid: k, t: e.t, jour: O.jourDe(e.t, fuseau), titre: e.titre || "", items: e.items };
    }).sort(function (a, b) { return a.t - b.t; });
  }
  // Nombre de fois qu'une question (ou un sous-type d'exercice) a été posée à la classe.
  function poses(ev, classe) {
    var n = {}, vus = {};
    (ev || []).forEach(function (e) {
      if (!e || e.c !== classe) return;
      if (e.a === "vote") {
        var k = e.el + "|" + (e.sid || e.id);
        if (!vus[k]) { vus[k] = 1; n[e.el] = (n[e.el] || 0) + 1; }
      }
    });
    echauffements(ev, classe).forEach(function (h) {
      h.items.forEach(function (it) { if (it && it.id) n[it.id] = (n[it.id] || 0) + 1; });
    });
    return n;
  }
  // Questions « à reprendre » : dernier niveau noté lors d'un échauffement = 0 (peu ont réussi).
  function aReprendre(ev, classe) {
    var dernierNiveau = {}, out = {};
    echauffements(ev, classe).forEach(function (h) {
      h.items.forEach(function (it) {
        if (it && it.id && it.niveau !== undefined && it.niveau !== null) dernierNiveau[it.id] = it.niveau;
      });
    });
    Object.keys(dernierNiveau).forEach(function (id) { if (dernierNiveau[id] === 0) out[id] = true; });
    return out;
  }
  function grainesUtilisees(ev, classe) {
    var s = {};
    (ev || []).forEach(function (e) {
      if (!e || e.c !== classe) return;
      if (e.a === "exercice" && e.graine) s[e.graine] = 1;
      if (e.a === "echauffement" && Array.isArray(e.items)) e.items.forEach(function (it) { if (it && it.graine) s[it.graine] = 1; });
    });
    return s;
  }
  return { cmpEv: cmpEv, etat: etat, dansCours: dansCours, dernier: dernier, seance: seance, jours: jours, uaaDe: uaaDe,
           uaasVues: uaasVues, echauffements: echauffements, poses: poses, aReprendre: aReprendre,
           grainesUtilisees: grainesUtilisees };
});
