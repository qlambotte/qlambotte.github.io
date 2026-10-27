/* journal.js — texte du journal de classe et des devoirs, d'après les marques de la séance du jour. */
(function (root, fabrique) {
  var m = fabrique(typeof require === "function" ? require("./outils.js") : root.Pilotage.outils,
                   typeof require === "function" ? require("./ev.js") : root.Pilotage.ev);
  if (typeof module === "object" && module.exports) module.exports = m;
  else { root.Pilotage = root.Pilotage || {}; root.Pilotage.journal = m; }
})(typeof window !== "undefined" ? window : this, function (O, E) {
  "use strict";

  // Point d'arrêt au début de la séance = dernier élément marqué avant le début de la journée.
  // Arrivée = dernier élément marqué pendant la séance du jour.
  function bornes(p) {                       // p : { ev, classe, uaa, index, jour, fuseau }
    // p.jusque (ms, facultatif) : état reconstitué à cet instant — fin du jour pour un jour passé (navigation de date).
    var etatJour = E.etat(p.ev, p.classe, p.fuseau, p.jusque);
    var debutJour = jourVersMs(p.jour, p.fuseau);
    var etatAvant = E.etat(p.ev, p.classe, p.fuseau, debutJour);
    var pos = p.index && p.index.pos;
    // départ : le point le plus avancé avant la séance ; arrivée : le plus avancé vu pendant la séance
    // (une définition revue en fin d'heure ne fait pas reculer le « à « … » »).
    var deb = E.dernier(etatAvant, p.uaa, undefined, pos), liste = E.seance(etatJour, p.jour, p.uaa);
    var finId = E.plusAvance(liste, pos);
    var fin = finId ? { el: finId, t: etatJour[finId].t } : null;
    return { debut: deb, fin: fin, vusAujourdhui: liste };
  }
  // Début de la journée locale (ms) : on cherche l'instant où le jour local devient p.jour.
  function jourVersMs(ymd, fuseau) {
    var a = ymd.split("-"), t = Date.UTC(+a[0], +a[1] - 1, +a[2]) - 14 * 3600000;
    while (O.jourDe(t, fuseau) < ymd) t += 15 * 60000;
    return t;
  }
  // Instant (ms) où le jour local `ymd` se termine = début du suivant. Un jour de 25 h (25/10/2026) a une fin 25 h après son début.
  function finDeJour(ymd, fuseau) { return jourVersMs(O.ajouterJours(ymd, 1), fuseau); }
  function titreSection(index, id) {
    if (!id) return null;
    var s = index.sectionDe(id);
    return s ? s.titre : (index.parId[id] ? index.parId[id].titre : id);
  }

  // Échauffement du jour : celui de la dernière session de la journée.
  function echauffementDuJour(p) {
    var liste = E.echauffements(p.ev, p.classe, p.fuseau).filter(function (h) { return h.jour === p.jour; });
    return liste.length ? liste[liste.length - 1] : null;
  }
  function pluriel(n, un, plus) { return n + " " + (n > 1 ? plus : un); }

  function ligneEchauffement(p) {
    var h = echauffementDuJour(p);
    if (!h) return "Échauffement : aucun";
    var nQ = h.items.filter(function (it) { return it && !it.graine && it.type !== "exercice"; }).length;
    var nE = h.items.length - nQ;
    if (!nQ && !nE) return "Échauffement : aucun";
    var s = nQ ? "Échauffement : " + nQ + " QCM" + (nE ? " + " + pluriel(nE, "exercice", "exercices") : "") : "Échauffement : " + pluriel(nE, "exercice", "exercices");
    return s;
  }
  function numerosExercices(p, vus) {
    var els = vus.map(function (id) { return p.index.parId[id]; }).filter(function (e) { return e && e.type === "exercice"; });
    els.sort(function (a, b) { return p.index.pos[a.id] - p.index.pos[b.id]; });
    return els.map(function (e) { return e.num || e.titre; });
  }

  // Titre du point de départ : section du point d'arrêt d'avant la séance, sinon première section du cours.
  function titreDebut(p, b) {
    if (b.debut) return titreSection(p.index, b.debut.el);
    var premiere = p.index.sectionsOrdonnees().filter(function (s) { return s.type === "section"; })[0];
    return premiere ? premiere.titre : "…";
  }
  // Texte du journal (3 lignes, sans date ni jour).
  function texteJournal(p) {
    var b = bornes(p), idx = p.index, debutTitre = titreDebut(p, b), finTitre;
    finTitre = b.fin ? titreSection(idx, b.fin.el) : null;
    var matiere = finTitre ? "Matière : de « " + debutTitre + " » à « " + finTitre + " »" : "Matière : –";
    var nums = numerosExercices(p, b.vusAujourdhui);
    return ligneEchauffement(p) + "\n" + matiere + "\nExercices : " + (nums.length ? nums.join(", ") : "–");
  }

  // Format d'une ligne de devoirs : {num}, {titre} (vide si le titre n'est qu'un « Exercice X.Y » générique),
  // {id} ; un groupe [ … ] est supprimé s'il contient un champ vide.
  function formaterExercice(fmt, e) {
    var generique = /^\s*exercice\s+[\d.]+\s*$/i.test(e.titre || "");
    var val = { num: e.num || "", titre: generique ? "" : (e.titre || ""), id: e.id };
    var s = fmt.replace(/\[([^\]]*)\]/g, function (_, g) {
      var vide = false;
      g.replace(/\{(\w+)\}/g, function (_, k) { if (!val[k]) vide = true; return ""; });
      return vide ? "" : g;
    });
    return s.replace(/\{(\w+)\}/g, function (_, k) { return val[k] === undefined ? "" : val[k]; }).trim();
  }

  // Devoirs : exercices « maison » situés dans la matière vue pendant la séance, c'est-à-dire entre le
  // point d'arrêt de début (exclu) et le dernier élément marqué (inclus), dans l'ordre du cours.
  // Les exercices regroupés dans une section « Exercices » en fin de chapitre ne sont pas « dans » la
  // matière : voir `devoirsDuChapitre`.
  function exercicesMaison(idx) {
    return idx.elements.filter(function (e) { return e.type === "exercice" && idx.etiquette(e, "maison"); });
  }
  function devoirs(p) {
    var b = bornes(p), idx = p.index;
    if (!b.fin) return { lignes: [], texte: "", chapitre: null, propositionChapitre: [] };
    var d = b.debut ? idx.pos[b.debut.el] : -1, f = idx.pos[b.fin.el];
    var lignes = exercicesMaison(idx).filter(function (e) { return idx.pos[e.id] > d && idx.pos[e.id] <= f; });
    var chap = idx.chapitreDe(b.fin.el);
    var prop = chap ? exercicesMaison(idx).filter(function (e) {
      var c = idx.chapitreDe(e.id); return c && c.id === chap.id && lignes.indexOf(e) < 0;
    }) : [];
    return { lignes: lignes, texte: texteDevoirs(lignes, p.format), chapitre: chap, propositionChapitre: prop };
  }
  function texteDevoirs(exos, format) {
    return exos.map(function (e) { return formaterExercice(format || "Exercice {num}[ : {titre}]", e); }).join("\n");
  }
  return { titreDebut: titreDebut, bornes: bornes, texteJournal: texteJournal, devoirs: devoirs, texteDevoirs: texteDevoirs,
           formaterExercice: formaterExercice, jourVersMs: jourVersMs, finDeJour: finDeJour, titreSection: titreSection };
});
