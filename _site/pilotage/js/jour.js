/* jour.js — jour affiché par la page de pilotage : lecture/écriture de ?jour=AAAA-MM-JJ, écart avec aujourd'hui
   (logique pure, sans accès au DOM). Les dates sont des chaînes AAAA-MM-JJ du fuseau de la config : l'écart se
   compte en jours de calendrier, donc le changement d'heure (25 h le 25/10/2026) n'y change rien. */
(function (root, fabrique) {
  var m = fabrique(typeof require === "function" ? require("./outils.js") : root.Pilotage.outils);
  if (typeof module === "object" && module.exports) module.exports = m;
  else { root.Pilotage = root.Pilotage || {}; root.Pilotage.jour = m; }
})(typeof window !== "undefined" ? window : this, function (O) {
  "use strict";

  // Jour demandé dans l'URL (location.search), ou null si absent ou invalide (date impossible : 2026-02-30).
  function dansUrl(search) {
    var v = new URLSearchParams(search || "").get("jour");
    return v && O.dateValide(v) ? v : null;
  }
  // Nouvelle chaîne de recherche : ?jour= posé (ou retiré si c'est aujourd'hui), tous les autres paramètres
  // (?maintenant=, ?classe=, …) conservés.
  function urlAvec(search, jour, aujourdhui) {
    var p = new URLSearchParams(search || "");
    if (!jour || jour === aujourdhui) p.delete("jour"); else p.set("jour", jour);
    var q = p.toString();
    return q ? "?" + q : "";
  }
  // "passe" | "aujourdhui" | "avenir"
  function statut(aujourdhui, jour) {
    return jour < aujourdhui ? "passe" : jour > aujourdhui ? "avenir" : "aujourdhui";
  }
  // « il y a 3 j » / « dans 3 j » ; "" pour aujourd'hui.
  function relatif(aujourdhui, jour) {
    var n = O.ecartJours(aujourdhui, jour);
    return n === 0 ? "" : n < 0 ? "il y a " + (-n) + " j" : "dans " + n + " j";
  }
  // Texte de la pastille de retour (absente le jour même : "").
  function pastilleRetour(aujourdhui, jour) {
    var r = relatif(aujourdhui, jour);
    return r ? "↩ Aujourd'hui · " + r : "";
  }
  return { dansUrl: dansUrl, urlAvec: urlAvec, statut: statut, relatif: relatif, pastilleRetour: pastilleRetour };
});
