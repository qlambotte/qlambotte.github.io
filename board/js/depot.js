/* depot.js — lecture/écriture d'un fichier du dépôt privé de synchronisation (API « contents » de GitHub).
   Réutilise le dépôt et le jeton déjà configurés pour le pilotage (même domaine : même stockage local) :
   « typweb.sync.v1 » (dépôt, branche) et « typweb.sync.jeton » (clair, ou chiffré par phrase secrète PBKDF2/AES-GCM).
   Le jeton n'est jamais recopié, ni affiché, ni écrit ailleurs ; chiffré, il ne vit qu'en mémoire une fois déverrouillé.
   Ce module ne touche pas à sync.js : il n'envoie rien du journal de classe. */
(function (root, fabrique) {
  var m = fabrique(root);
  if (typeof module === "object" && module.exports) module.exports = m;
  else { root.Board = root.Board || {}; root.Board.depot = m; }
})(typeof window !== "undefined" ? window : this, function (racine) {
  "use strict";
  var CLE_ETAT = "typweb.sync.v1", CLE_JETON = "typweb.sync.jeton", RE_DEPOT = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

  function Erreur(code, message, extra) {
    var e = new Error(message); e.name = "DepotErreur"; e.code = code; e.transitoire = false;
    if (extra) Object.keys(extra).forEach(function (k) { e[k] = extra[k]; });
    return e;
  }
  function versB64(texte) {
    var o = new TextEncoder().encode(texte), s = "", i;
    for (i = 0; i < o.length; i += 0x8000) s += String.fromCharCode.apply(null, o.subarray(i, i + 0x8000));
    return btoa(s);
  }
  function deB64(b64) {
    var bin = atob(String(b64).replace(/\s/g, "")), o = new Uint8Array(bin.length), i;
    for (i = 0; i < bin.length; i++) o[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(o);
  }
  function b64Octets(b64) { var bin = atob(b64), o = new Uint8Array(bin.length), i; for (i = 0; i < bin.length; i++) o[i] = bin.charCodeAt(i); return o; }
  function encChemin(c) { return c.split("/").map(encodeURIComponent).join("/"); }

  function creer(opt) {
    opt = opt || {};
    var stock = opt.stockage || (function () { try { return localStorage; } catch (e) { return null; } })();
    var fetchF = opt.fetch || (typeof fetch === "function" ? fetch.bind(racine) : null);
    var API = (opt.api || "https://api.github.com").replace(/\/$/, "");
    var cryptoW = opt.crypto || (typeof crypto !== "undefined" ? crypto : null);
    var jetonMem = null;

    function lire(k) { try { return stock ? stock.getItem(k) : null; } catch (e) { return null; } }
    function etat() {
      var j = {}; try { j = JSON.parse(lire(CLE_ETAT) || "{}") || {}; } catch (e) {}
      return { depot: RE_DEPOT.test(j.depot || "") ? j.depot : "", branche: /^[A-Za-z0-9_.\/-]+$/.test(j.branche || "") ? j.branche : "main" };
    }
    function brut() { return lire(CLE_JETON) || ""; }
    function chiffre() { return brut().charAt(0) === "{"; }
    function jeton() { return chiffre() ? jetonMem : (brut() || null); }
    function cacher(t) {
      t = String(t == null ? "" : t); var j = jeton();
      if (j && t.indexOf(j) >= 0) t = t.split(j).join("•••");
      return t.replace(/github_pat_[A-Za-z0-9_]+|gh[pousr]_[A-Za-z0-9]+/g, "•••");
    }
    function verifChemin(c) {
      if (!/^[A-Za-z0-9_.\/-]+$/.test(c) || c.indexOf("..") >= 0 || c.charAt(0) === "/") throw Erreur("config", "Chemin invalide : " + c);
    }
    async function appel(methode, chemin, corps) {
      var e = etat(), tok = jeton();
      if (!e.depot) throw Erreur("config", "Synchronisation non configurée : ouvre les réglages du pilotage et charge ta clé.");
      if (!tok) throw Erreur(chiffre() ? "verrouille" : "jeton", chiffre() ? "Jeton verrouillé : saisis ta phrase secrète." : "Aucun jeton sur cet appareil.");
      if (!fetchF) throw Erreur("reseau", "Réseau indisponible.", { transitoire: true });
      var ctl = typeof AbortController === "function" ? new AbortController() : null, minut = null, rep;
      try {
        if (ctl) minut = setTimeout(function () { ctl.abort(); }, 15000);
        rep = await fetchF(API + "/repos/" + e.depot + "/contents/" + chemin, { method: methode, cache: "no-store", signal: ctl ? ctl.signal : undefined,
          headers: Object.assign({ "Authorization": "Bearer " + tok, "Accept": "application/vnd.github+json" }, corps !== undefined ? { "Content-Type": "application/json" } : {}),
          body: corps !== undefined ? JSON.stringify(corps) : undefined });
      } catch (err) { throw Erreur("reseau", "Pas de connexion à GitHub (hors ligne ou réseau bloqué) : copie locale conservée.", { transitoire: true }); }
      finally { if (minut) clearTimeout(minut); }
      var texte = ""; try { texte = await rep.text(); } catch (err) {}
      return { status: rep.status, texte: texte };
    }
    function erreurHttp(r, ctx) {
      var s = r.status, msg = ""; try { msg = cacher((JSON.parse(r.texte) || {}).message || "").slice(0, 160); } catch (e) {}
      if (s === 401) return Erreur("jeton", "Jeton invalide ou expiré.");
      if (s === 403) return Erreur("portee", "Accès refusé (droits du jeton ou limite GitHub)." + (msg ? " [" + msg + "]" : ""), { transitoire: true });
      if (s === 404) return Erreur("introuvable", "Dépôt introuvable (nom ou droits du jeton).");
      if (s === 409 || s === 422) return Erreur("conflit", "Conflit d'écriture : nouvel essai." + (msg ? " [" + msg + "]" : ""), { transitoire: true });
      if (s >= 500) return Erreur("serveur", "GitHub est indisponible (HTTP " + s + ").", { transitoire: true });
      return Erreur("http", "Réponse inattendue (HTTP " + s + ")" + (ctx ? " [" + ctx + "]" : "") + ".");
    }

    var api = {
      configure: function () { return !!(etat().depot && brut()); },
      verrouille: function () { return chiffre() && !jetonMem; },
      depot: function () { return etat().depot; },
      deverrouiller: async function (phrase) {
        var b; try { b = JSON.parse(brut()); } catch (e) { return true; }
        if (!b || !b.chiffre) return true;
        try {
          var base = await cryptoW.subtle.importKey("raw", new TextEncoder().encode(String(phrase)), "PBKDF2", false, ["deriveKey"]);
          var cle = await cryptoW.subtle.deriveKey({ name: "PBKDF2", salt: b64Octets(b.sel), iterations: b.iter, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
          jetonMem = new TextDecoder().decode(await cryptoW.subtle.decrypt({ name: "AES-GCM", iv: b64Octets(b.iv) }, cle, b64Octets(b.ct)));
        } catch (e) { throw Erreur("phrase", "Phrase secrète incorrecte."); }
        return true;
      },
      // → { texte, sha } ou null si le fichier n'existe pas.
      lire: async function (chemin) {
        verifChemin(chemin);
        var r = await appel("GET", encChemin(chemin) + "?ref=" + encodeURIComponent(etat().branche));
        if (r.status === 404) {
          var corps = {}; try { corps = JSON.parse(r.texte); } catch (e) {}
          if (/not found/i.test(corps.message || "") && !/contents|path/i.test(corps.documentation_url || "")) { /* fichier absent */ }
          return null;
        }
        if (r.status !== 200) throw erreurHttp(r, "lecture " + chemin);
        var j; try { j = JSON.parse(r.texte); } catch (e) { throw Erreur("filtre", "Réponse illisible (portail Wi-Fi ou filtre ?).", { transitoire: true }); }
        if (Array.isArray(j) || typeof j.content !== "string") throw Erreur("http", "« " + chemin + " » n'est pas un fichier.");
        return { texte: deB64(j.content), sha: j.sha };
      },
      // sha : celui de la version lue (absent pour une création). → { sha }
      ecrire: async function (chemin, texte, o) {
        verifChemin(chemin); o = o || {};
        var corps = { message: o.message || "Mise à jour (tableau de bord)", content: versB64(texte), branch: etat().branche };
        if (o.sha) corps.sha = o.sha;
        var r = await appel("PUT", encChemin(chemin), corps);
        if (r.status !== 200 && r.status !== 201) throw erreurHttp(r, "écriture " + chemin);
        try { return { sha: JSON.parse(r.texte).content.sha }; } catch (e) { return { sha: "" }; }
      }
    };
    return api;
  }
  return { creer: creer, Erreur: Erreur };
});
