/* interros.js — planifier ou retirer une interro dans le texte de config/pilotage.json (logique pure).
   Seul le tableau « interros » est réécrit (une interro par ligne, triées par date puis classe) : le reste du fichier
   garde sa mise en forme. Le résultat complet est revalidé (config.js › valider) avant d'être proposé. */
(function (root, fabrique) {
  var m = typeof require === "function" ? fabrique(require("./outils.js"), require("./config.js"))
                                        : fabrique(root.Pilotage.outils, root.Pilotage.config);
  if (typeof module === "object" && module.exports) module.exports = m;
  else { root.Pilotage = root.Pilotage || {}; root.Pilotage.interros = m; }
})(typeof window !== "undefined" ? window : this, function (O, C) {
  "use strict";
  var TYPES = ["formatif", "certificatif", "bilan"];

  function nettoyer(it) {
    it = it || {};
    var s = function (v) { return typeof v === "string" ? v.trim() : ""; };
    return { date: s(it.date), classe: s(it.classe), uaa: s(it.uaa), type: s(it.type) };
  }
  function meme(a, b) { return a.date === b.date && a.classe === b.classe && a.uaa === b.uaa && a.type === b.type; }
  function trier(l) {
    return l.slice().sort(function (a, b) {
      return a.date < b.date ? -1 : a.date > b.date ? 1 : a.classe < b.classe ? -1 : a.classe > b.classe ? 1 : 0;
    });
  }

  // Contrôle des champs du formulaire (messages lisibles, un par champ). `o.classes` : codes connus ; `o.aujourdhui` : AAAA-MM-JJ.
  function controler(it, o) {
    o = o || {};
    var err = [];
    if (!O.dateValide(it.date)) err.push("Date : choisis une date valide.");
    else if (o.aujourdhui && it.date < o.aujourdhui) err.push("Date : le " + O.dateFr(it.date) + " est passé (une interro passée n'est pas affichée).");
    if (o.classes && o.classes.indexOf(it.classe) < 0) err.push("Classe : « " + it.classe + " » n'existe pas dans la configuration.");
    if (!it.uaa) err.push("UAA : à compléter (par exemple 5UAA3).");
    if (!it.type) err.push("Type : à compléter (formatif, certificatif, bilan…).");
    return err;
  }

  /* ---- repérage du tableau « interros » au premier niveau du JSON (chaînes et échappements respectés) ---- */
  function bornes(texte) {
    var prof = 0, i = 0, n = texte.length;
    while (i < n) {
      var c = texte.charAt(i);
      if (c === '"') {
        var debut = i, j = i + 1;
        while (j < n && texte.charAt(j) !== '"') j += texte.charAt(j) === "\\" ? 2 : 1;
        var chaine = texte.slice(debut, j + 1);
        i = j + 1;
        if (prof === 1 && chaine === '"interros"') {
          var k = i; while (k < n && /\s/.test(texte.charAt(k))) k++;
          if (texte.charAt(k) !== ":") continue;                    // une valeur, pas une clé
          k++; while (k < n && /\s/.test(texte.charAt(k))) k++;
          if (texte.charAt(k) !== "[") return null;                  // « interros » qui n'est pas un tableau : refus
          var ouvre = k, p = 0;
          for (; k < n; k++) {
            var d = texte.charAt(k);
            if (d === '"') { k++; while (k < n && texte.charAt(k) !== '"') k += texte.charAt(k) === "\\" ? 2 : 1; continue; }
            if (d === "[" || d === "{") p++;
            else if (d === "]" || d === "}") { p--; if (p === 0) break; }
          }
          var ligne = texte.lastIndexOf("\n", debut) + 1, retrait = texte.slice(ligne, debut);
          return { debut: ouvre, fin: k, retrait: /^\s*$/.test(retrait) ? retrait : "  " };
        }
        continue;
      }
      if (c === "{" || c === "[") prof++;
      else if (c === "}" || c === "]") prof--;
      i++;
    }
    return { absent: true };
  }
  function uneLigne(o) {
    return "{ " + Object.keys(o).map(function (k) { return JSON.stringify(k) + ": " + JSON.stringify(o[k]); }).join(", ") + " }";
  }
  function tableau(l, retrait) {
    if (!l.length) return "[]";
    return "[\n" + l.map(function (o) { return retrait + "  " + uneLigne(o); }).join(",\n") + "\n" + retrait + "]";
  }
  function remplacer(texte, l) {
    var b = bornes(texte);
    if (!b) return null;
    if (!b.absent) return texte.slice(0, b.debut) + tableau(l, b.retrait) + texte.slice(b.fin + 1);
    var fin = texte.lastIndexOf("}");                                  // pas de clé « interros » : ajoutée en fin d'objet
    var avant = texte.slice(0, fin).replace(/\s+$/, "");
    var sep = avant.charAt(avant.length - 1) === "{" ? "" : ",";
    return avant + sep + '\n  "interros": ' + tableau(l, "  ") + "\n" + texte.slice(fin);
  }

  // f(liste) modifie la liste ou renvoie un message d'erreur. → { ok, texte, config } ou { ok: false, erreurs }
  function modifier(texte, f) {
    var obj;
    try { obj = JSON.parse(texte); } catch (e) { return { ok: false, erreurs: ["config/pilotage.json n'est pas un JSON valide : rien n'est modifié."] }; }
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return { ok: false, erreurs: ["config/pilotage.json : un objet est attendu."] };
    if (obj.interros !== undefined && !Array.isArray(obj.interros)) return { ok: false, erreurs: ["config/pilotage.json : « interros » n'est pas une liste."] };
    var l = (obj.interros || []).slice();
    var msg = f(l);
    if (msg) return { ok: false, erreurs: [msg] };
    var nouveau = remplacer(texte, trier(l));
    if (nouveau === null) return { ok: false, erreurs: ["config/pilotage.json : « interros » introuvable ou mal formé."] };
    var v = C.valider(nouveau);
    if (!v.ok) return { ok: false, erreurs: v.erreurs };
    return { ok: true, texte: nouveau, config: v.config };
  }

  function ajouter(texte, it, o) {
    it = nettoyer(it);
    var err = controler(it, o);
    if (err.length) return { ok: false, erreurs: err };
    return modifier(texte, function (l) {
      if (l.some(function (x) { return meme(nettoyer(x), it); })) return "Cette interro est déjà planifiée.";
      l.push(it);
    });
  }
  function retirer(texte, it) {
    it = nettoyer(it);
    return modifier(texte, function (l) {
      var i = -1;
      l.forEach(function (x, k) { if (i < 0 && meme(nettoyer(x), it)) i = k; });
      if (i < 0) return "Cette interro n'est plus dans le dépôt (déjà retirée ?).";
      l.splice(i, 1);
    });
  }

  return { TYPES: TYPES, nettoyer: nettoyer, controler: controler, ajouter: ajouter, retirer: retirer };
});
