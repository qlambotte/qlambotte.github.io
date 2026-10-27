/* theme.js — apparence de la page : « jour » (par défaut), « soir » (sombre), « auto » (suit le réglage de l'appareil).
   Chargé dans <head>, avant la feuille de style, pour éviter un éclair blanc en mode soir. Le choix est une simple
   commodité de cet appareil (localStorage) : s'il est effacé, la page revient au mode jour. */
(function () {
  "use strict";
  var CLE = "pilotage.theme", VALEURS = ["jour", "soir", "auto"];
  function lire() { try { var v = localStorage.getItem(CLE); return VALEURS.indexOf(v) >= 0 ? v : "jour"; } catch (e) { return "jour"; } }
  function appliquer(v) { document.documentElement.setAttribute("data-theme", v); }
  function choisir(v) {
    if (VALEURS.indexOf(v) < 0) v = "jour";
    try { if (v === "jour") localStorage.removeItem(CLE); else localStorage.setItem(CLE, v); } catch (e) {}
    appliquer(v);
    return v;
  }
  appliquer(lire());
  window.Pilotage = window.Pilotage || {};
  window.Pilotage.theme = { lire: lire, choisir: choisir, VALEURS: VALEURS };
})();
