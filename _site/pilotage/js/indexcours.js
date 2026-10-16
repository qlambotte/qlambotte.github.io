/* indexcours.js — parcours de index.json (P0) : parents, ordre du cours, sections, titres. */
(function (root, fabrique) {
  var m = fabrique();
  if (typeof module === "object" && module.exports) module.exports = m;
  else { root.Pilotage = root.Pilotage || {}; root.Pilotage.indexcours = m; }
})(typeof window !== "undefined" ? window : this, function () {
  "use strict";
  var MARQUABLES = { definition: 1, propriete: 1, remarque: 1, exemple: 1, activite: 1, exercice: 1 };

  function creer(index) {
    var els = (index && Array.isArray(index.elements)) ? index.elements : [];
    var parId = {}, pos = {}, enfants = {};
    els.forEach(function (e, i) {
      parId[e.id] = e; pos[e.id] = i;
      if (e.parent) (enfants[e.parent] = enfants[e.parent] || []).push(e.id);
    });
    function a(e, tag) { return (e.etiquettes || []).indexOf(tag) >= 0; }
    function marquable(e) { return !!MARQUABLES[e.type] && !a(e, "maison"); }
    // Section (ou chapitre) qui contient l'élément : lui-même s'il en est une.
    function sectionDe(id) {
      var e = parId[id], garde = 0;
      while (e && garde++ < 20) {
        if (e.type === "section" || e.type === "chapitre") return e;
        e = e.parent ? parId[e.parent] : null;
      }
      return null;
    }
    function chapitreDe(id) {
      var e = parId[id], garde = 0;
      while (e && garde++ < 20) { if (e.type === "chapitre") return e; e = e.parent ? parId[e.parent] : null; }
      return null;
    }
    function ancetres(id) {                       // [id, parent, grand-parent…]
      var out = [], e = parId[id], garde = 0;
      while (e && garde++ < 20) { out.push(e.id); e = e.parent ? parId[e.parent] : null; }
      return out;
    }
    // Dernier élément marquable d'une section (sous-sections comprises), dans l'ordre du cours.
    function dernierMarquable(sectionId) {
      var best = null;
      els.forEach(function (e) {
        if (marquable(e) && ancetres(e.id).indexOf(sectionId) >= 0) best = e;
      });
      return best;
    }
    function sectionsOrdonnees() {
      return els.filter(function (e) { return e.type === "section" || e.type === "chapitre"; });
    }
    return { elements: els, parId: parId, pos: pos, enfants: enfants, marquable: marquable, sectionDe: sectionDe,
             chapitreDe: chapitreDe, ancetres: ancetres, dernierMarquable: dernierMarquable,
             sectionsOrdonnees: sectionsOrdonnees, etiquette: a, vide: els.length === 0 };
  }
  return { creer: creer, MARQUABLES: MARQUABLES };
});
