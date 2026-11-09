/* prepa-logique.js — logique pure de la page « Prépa » : modifications d'etat.json du site coursPrepa.
   Aucune entrée-sortie : chaque fonction reçoit l'objet etat et le modifie (elle le renvoie aussi). Testée par tests/prepa.test.js.
   Format d'etat.json : voir le README du dépôt coursPrepa (section « etat.json »). Les clés inconnues sont conservées. */
(function (root, fabrique) {
  var m = fabrique();
  if (typeof module === "object" && module.exports) module.exports = m;
  else { root.Board = root.Board || {}; root.Board.prepa = m; }
})(typeof window !== "undefined" ? window : this, function () {
  "use strict";
  var RE_ID = /^[A-Za-z][A-Za-z0-9_-]*$/, RE_THEME = /^[a-z][a-z0-9-]*$/;

  function lireEtat(texte) {
    var e;
    try { e = JSON.parse(texte); } catch (x) { throw new Error("etat.json est illisible."); }
    if (!e || typeof e !== "object" || Array.isArray(e)) throw new Error("etat.json n'est pas un objet.");
    return e;
  }
  function verifTheme(theme) { if (!RE_THEME.test(theme || "")) throw new Error("Thème invalide : " + theme); }
  function section(etat, theme) {
    verifTheme(theme);
    var t = etat[theme];
    if (!t || typeof t !== "object" || Array.isArray(t)) t = etat[theme] = {};
    return t;
  }
  function ids(liste) {
    var vus = {}, r = [];
    (Array.isArray(liste) ? liste : []).forEach(function (i) { if (typeof i === "string" && RE_ID.test(i) && !vus[i]) { vus[i] = 1; r.push(i); } });
    return r;
  }
  // État d'un thème avec valeurs par défaut (sans modifier etat).
  function lire(etat, theme) {
    var t = etat && etat[theme] && typeof etat[theme] === "object" ? etat[theme] : {};
    return { solutions: t.solutions === true, ticket: ids(t.ticket), ticket_solutions: t.ticket_solutions === true,
             exercices: t.exercices === true,
             votes: t.votes && typeof t.votes === "object" && !Array.isArray(t.votes) ? t.votes : {} };
  }
  function fixerSolutions(etat, theme, actif) { section(etat, theme).solutions = !!actif; return etat; }
  function fixerTicketSolutions(etat, theme, actif) { section(etat, theme).ticket_solutions = !!actif; return etat; }

  // Correction des exercices d'une catégorie (thème ou « melange ») : bouton « Corriger » et onglet « Solution ».
  // L'ancienne clé « reponses_activees » (réponses masquées) n'est plus utilisée : elle est retirée au passage.
  function fixerExercices(etat, theme, actif) {
    section(etat, theme).exercices = !!actif;
    delete etat.reponses_activees;
    return etat;
  }
  function fixerExercicesTous(etat, themes, actif) {
    (themes || []).forEach(function (th) { fixerExercices(etat, th, actif); });
    return etat;
  }

  // « 45 », « 45,5 », « 45 % » → 0.45 ; vide ou invalide → null ; hors de 0–100 → null.
  function taux(saisie) {
    if (saisie == null) return null;
    var t = String(saisie).replace(/%/g, "").replace(",", ".").trim();
    if (t === "" || !/^\d+(\.\d+)?$/.test(t)) return null;
    var v = parseFloat(t);
    return v >= 0 && v <= 100 ? Math.round(v) / 100 : null;
  }
  function affichage(v) { return typeof v === "number" && isFinite(v) ? String(Math.round(v * 100)) : ""; }

  // saisie : { id: { vote: 0.28|null, revote: 0.55|null } } ; ticket : liste d'ids (ordre conservé).
  // Les taux absents sont supprimés ; une question sans aucun taux disparaît de « votes ».
  function enregistrerVotes(etat, theme, saisie, ticket) {
    var t = section(etat, theme), votes = t.votes && typeof t.votes === "object" && !Array.isArray(t.votes) ? t.votes : {};
    Object.keys(saisie || {}).forEach(function (id) {
      if (!RE_ID.test(id)) throw new Error("Identifiant de question invalide : " + id);
      var s = saisie[id] || {}, e = Object.assign({}, votes[id] || {});
      ["vote", "revote"].forEach(function (k) {
        if (typeof s[k] === "number" && s[k] >= 0 && s[k] <= 1) e[k] = Math.round(s[k] * 100) / 100; else delete e[k];
      });
      if (Object.keys(e).length) votes[id] = e; else delete votes[id];
    });
    t.votes = votes;
    t.ticket = ids(ticket);
    if (!("solutions" in t)) t.solutions = false;
    if (!("ticket_solutions" in t)) t.ticket_solutions = false;
    return etat;
  }

  // Questions de la séance dont le premier vote est sous le seuil (0–1), dans l'ordre des questions.
  function proposerTicket(questions, votes, seuil) {
    return questions.filter(function (q) { var v = votes[q.id]; return v && typeof v.vote === "number" && v.vote < seuil; })
                    .map(function (q) { return q.id; });
  }

  function serialiser(etat) { return JSON.stringify(etat, null, 2) + "\n"; }

  return { lireEtat: lireEtat, lire: lire, fixerSolutions: fixerSolutions, fixerTicketSolutions: fixerTicketSolutions,
           fixerExercices: fixerExercices, fixerExercicesTous: fixerExercicesTous, taux: taux, affichage: affichage,
           enregistrerVotes: enregistrerVotes, proposerTicket: proposerTicket, serialiser: serialiser };
});
