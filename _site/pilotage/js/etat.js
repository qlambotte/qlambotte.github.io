/* etat.js — façade d'accès à l'état de la classe. TOUT passage par la couche prof (window.typwebProf, P1/P3) :
   la page ne lit ni n'écrit elle-même le journal. Pour changer de source (P5 : dépôt privé), fournir une
   autre implémentation de cette interface à App.init({ etat }).
   Seule exception documentée : si la couche prof n'a pas pu être chargée (hors ligne, première visite), le
   journal brut `typweb.prof.v1` est LU (couche-prof.md : « reste lisible sans la couche ») ; aucune écriture. */
(function (root, fabrique) {
  var m = fabrique();
  if (typeof module === "object" && module.exports) module.exports = m;
  else { root.Pilotage = root.Pilotage || {}; root.Pilotage.etat = m; }
})(typeof window !== "undefined" ? window : this, function () {
  "use strict";
  var CLE_JOURNAL = "typweb.prof.v1", CLE_CLASSE = "typweb.classe", CLE_DRAPEAU = "typweb.prof";

  function lireBrut(stockage) {
    try {
      var j = JSON.parse(stockage.getItem(CLE_JOURNAL) || "null");
      return j && Array.isArray(j.ev) ? j.ev : [];
    } catch (e) { return []; }
  }

  // P : window.typwebProf ou null ; stockage : localStorage (injecté pour les tests).
  function creer(P, stockage) {
    stockage = stockage || (typeof localStorage !== "undefined" ? localStorage : null);
    var f = {
      couche: !!P,                                   // la couche prof est chargée : écriture possible
      evenements: function () { return P ? P.evenements() : (stockage ? lireBrut(stockage) : []); },
      classeActive: function () { return P ? P.classe() : ((stockage && stockage.getItem(CLE_CLASSE)) || ""); },
      fixerClasse: function (c) { if (P) P.fixerClasse(c); else if (stockage) { c ? stockage.setItem(CLE_CLASSE, c) : stockage.removeItem(CLE_CLASSE); } },
      definirClasses: function (liste) { return P && P.definirClasses ? P.definirClasses(liste) : false; },
      marquer: function (id, classe) { return P ? P.marquer(id, classe) : false; },
      abonner: function (g) { return P ? P.abonner(g) : function () {}; },
      exporter: function () { return P && P.exporter ? P.exporter() : { format: "typweb.prof.v1", exporte: new Date().toISOString(), v: 2, ev: f.evenements() }; },
      importer: function (x) { return P && P.importer ? P.importer(x) : { ok: false, erreur: "couche prof indisponible : import impossible" }; },
      vote: function () { return P && P.vote ? P.vote : null; },
      modeProf: function () { try { return stockage.getItem(CLE_DRAPEAU) === "1"; } catch (e) { return false; } },
      activerModeProf: function () { try { stockage.setItem(CLE_DRAPEAU, "1"); return true; } catch (e) { return false; } }
    };
    return f;
  }
  // Classe mémorisée avant même que la couche soit chargée (pour savoir quel cours charger).
  function classeMemorisee(stockage) {
    try { return (stockage || localStorage).getItem(CLE_CLASSE) || ""; } catch (e) { return ""; }
  }
  return { creer: creer, classeMemorisee: classeMemorisee };
});
