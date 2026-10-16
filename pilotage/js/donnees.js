/* donnees.js — chargement de index.json / classe.json des cours, avec copie locale (Cache API) :
   réseau d'abord (délai court), sinon la dernière copie. Indique si une copie a servi (hors ligne). */
(function (root, fabrique) {
  var m = fabrique();
  if (typeof module === "object" && module.exports) module.exports = m;
  else { root.Pilotage = root.Pilotage || {}; root.Pilotage.donnees = m; }
})(typeof window !== "undefined" ? window : this, function () {
  "use strict";
  var NOM_CACHE = "pilotage-donnees";

  function avecDelai(url, ms) {
    var ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
    var t = ctl ? setTimeout(function () { ctl.abort(); }, ms) : null;
    return fetch(url, { cache: "no-cache", signal: ctl ? ctl.signal : undefined }).then(function (r) {
      if (t) clearTimeout(t);
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.text();
    }, function (e) { if (t) clearTimeout(t); throw e; });
  }
  function ouvrir() { return typeof caches !== "undefined" ? caches.open(NOM_CACHE) : Promise.reject(new Error("pas de cache")); }

  // → { json, copie: bool } ; rejette avec un message lisible si ni réseau ni copie.
  function chargerJson(url, ms) {
    return avecDelai(url, ms || 6000).then(function (txt) {
      var j = JSON.parse(txt);
      ouvrir().then(function (c) { return c.put(url, new Response(txt, { headers: { "content-type": "application/json" } })); }).catch(function () {});
      return { json: j, copie: false };
    }).catch(function (e) {
      return ouvrir().then(function (c) { return c.match(url); }).then(function (r) { return r ? r.text() : null; }, function () { return null; })
        .then(function (txt) {
          if (txt === null) throw new Error("« " + url + " » est indisponible (hors ligne et jamais consulté sur cet appareil).");
          return { json: JSON.parse(txt), copie: true };
        });
    });
  }
  // Banque de classe d'un cours : dépôt PRIVÉ (banques/<UAA>/classe.json, jeton de synchronisation) d'abord ;
  // sinon l'ancien fichier publié avec le site (champ « classe » de la configuration, facultatif) ; sinon la copie.
  function chargerBanque(cours, adresse, ms) {
    var cle = "https://pilotage.local/banques/" + cours.uaa + "/classe.json";       // clé de la copie locale
    var S = typeof window !== "undefined" ? window.typwebSync : null;
    var viaDepot = S && S.estConfigure && S.estConfigure() && S.lireFichier
      ? Promise.race([S.lireFichier("banques/" + cours.uaa + "/classe.json"),
                      new Promise(function (_, rej) { setTimeout(function () { rej(new Error("délai")); }, ms || 8000); })])
      : Promise.reject(new Error("dépôt non configuré"));
    return viaDepot.catch(function (e) {
      if (!cours.classe) throw e;
      return avecDelai(adresse(cours, cours.classe), ms || 6000);
    }).then(function (txt) {
      var j = JSON.parse(txt);
      ouvrir().then(function (c) { return c.put(cle, new Response(txt, { headers: { "content-type": "application/json" } })); }).catch(function () {});
      return { json: j, copie: false };
    }).catch(function () {
      return ouvrir().then(function (c) { return c.match(cle); }).then(function (r) { return r ? r.text() : null; }, function () { return null; })
        .then(function (txt) {
          if (txt === null) throw new Error("banque de classe de " + cours.uaa + " indisponible : configure la synchronisation (jeton) et ouvre la page une fois avec une connexion.");
          return { json: JSON.parse(txt), copie: true };
        });
    });
  }
  return { chargerJson: chargerJson, chargerBanque: chargerBanque, NOM_CACHE: NOM_CACHE };
});
