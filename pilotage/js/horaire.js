/* horaire.js — détection de la classe d'après l'horaire (logique pure, fuseau explicite). */
(function (root, fabrique) {
  var m = fabrique(typeof require === "function" ? require("./outils.js") : root.Pilotage.outils);
  if (typeof module === "object" && module.exports) module.exports = m;
  else { root.Pilotage = root.Pilotage || {}; root.Pilotage.horaire = m; }
})(typeof window !== "undefined" ? window : this, function (O) {
  "use strict";
  var AVANT = 15;     // minutes avant le début
  var APRES = 10;     // minutes après la fin

  function estConge(config, ymd) {
    return (config.conges || []).some(function (c) { return ymd >= c.du && ymd <= c.au; });
  }
  function creneauxDuJour(config, ymd) {
    var j = O.jourSemaine(ymd);
    return config.creneaux.filter(function (s) { return O.JOURS.indexOf(s.jour) === j; })
      .sort(function (a, b) { return O.minutes(a.debut) - O.minutes(b.debut); });
  }
  // Le créneau en cours (de 15 min avant le début à 10 min après la fin, bornes comprises), ou null.
  // Si deux fenêtres se chevauchent : un cours EN COURS (entre son début et sa fin) l'emporte toujours, le plus
  // récent s'il y en a deux ; sinon, celui dont le début est le plus proche. Deux cours qui se suivent : la classe
  // suivante n'est détectée qu'à la fin du premier, jamais 15 min avant.
  function detecter(config, date) {
    var l = O.local(date, config.fuseau);
    if (estConge(config, l.ymd)) return null;
    var cand = creneauxDuJour(config, l.ymd).filter(function (s) {
      return l.minutes >= O.minutes(s.debut) - AVANT && l.minutes <= O.minutes(s.fin) + APRES;
    });
    if (!cand.length) return null;
    var enCours = cand.filter(function (s) { return l.minutes >= O.minutes(s.debut) && l.minutes < O.minutes(s.fin); });
    if (enCours.length) {
      enCours.sort(function (a, b) { return O.minutes(b.debut) - O.minutes(a.debut); });
      return enCours[0];
    }
    cand.sort(function (a, b) { return Math.abs(l.minutes - O.minutes(a.debut)) - Math.abs(l.minutes - O.minutes(b.debut)); });
    return cand[0];
  }
  // Séances d'un jour donné (congés exclus), éventuellement d'une seule classe.
  function seancesDuJour(config, ymd, classe) {
    if (estConge(config, ymd)) return [];
    var l = creneauxDuJour(config, ymd);
    return classe ? l.filter(function (s) { return s.classe === classe; }) : l;
  }
  // Jour de cours le plus proche avant (sens = -1) ou après (sens = 1) ymd, pour une classe ; null au-delà de 120 jours.
  function jourDeCours(config, classe, ymd, sens) {
    for (var i = 1; i <= 120; i++) {
      var y = O.ajouterJours(ymd, sens * i);
      if (seancesDuJour(config, y, classe).length) return y;
    }
    return null;
  }
  // La prochaine séance dont la fenêtre n'a pas encore commencé : { ymd, creneau } ou null (dans les 60 jours).
  function prochaine(config, date) {
    var l = O.local(date, config.fuseau), i, ymd, liste;
    for (i = 0; i <= 60; i++) {
      ymd = O.ajouterJours(l.ymd, i);
      if (estConge(config, ymd)) continue;
      liste = creneauxDuJour(config, ymd).filter(function (s) {
        return i > 0 || O.minutes(s.debut) - AVANT > l.minutes;
      });
      if (liste.length) return { ymd: ymd, creneau: liste[0] };
    }
    return null;
  }
  function libelle(c) { return O.heureFr(c.debut) + "–" + O.heureFr(c.fin); }
  function libelleSeance(p) {
    var j = O.JOURS[O.jourSemaine(p.ymd)];
    return j + " " + O.dateFr(p.ymd) + ", " + libelle(p.creneau) + ", local " + p.creneau.local;
  }
  return { AVANT: AVANT, APRES: APRES, estConge: estConge, detecter: detecter, prochaine: prochaine,
           seancesDuJour: seancesDuJour, jourDeCours: jourDeCours,
           libelle: libelle, libelleSeance: libelleSeance };
});
