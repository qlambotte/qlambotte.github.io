/* taches.js — liste de tâches « local d'abord » : chaque tâche porte sa date de dernière modification (`maj`) ;
   la fusion avec le dépôt garde, tâche par tâche, la version la plus récente. Une suppression laisse une « pierre tombale »
   (supp) pendant 90 jours pour ne pas ressusciter la tâche depuis un autre appareil. Logique pure (node et navigateur). */
(function (root, fabrique) {
  var m = fabrique();
  if (typeof module === "object" && module.exports) module.exports = m;
  else { root.Board = root.Board || {}; root.Board.taches = m; }
})(typeof window !== "undefined" ? window : this, function () {
  "use strict";
  var CLE = "board.taches.v1", PURGE_MS = 90 * 86400000, RE_DATE = /^\d{4}-\d{2}-\d{2}$/;

  function creer(opt) {
    opt = opt || {};
    var stock = opt.stockage || (function () { try { return localStorage; } catch (e) { return null; } })();
    var maintenant = opt.maintenant || function () { return Date.now(); };
    var abonnes = [], mem = { v: 1, t: {} };

    function propre(x) {                                    // accepte seulement des champs connus, de types sûrs
      if (!x || typeof x !== "object" || typeof x.id !== "string" || !/^[A-Za-z0-9_-]{1,40}$/.test(x.id)) return null;
      var o = { id: x.id, texte: String(x.texte == null ? "" : x.texte).slice(0, 300), ech: RE_DATE.test(x.ech || "") ? x.ech : "",
                fait: !!x.fait, maj: +x.maj > 0 ? +x.maj : 0 };
      if (x.supp) o.supp = true;
      return o;
    }
    function lireTout() {
      try { var b = stock && stock.getItem(CLE); if (!b) return { v: 1, t: {} }; var j = JSON.parse(b), t = {}; Object.keys(j.t || {}).forEach(function (k) { var p = propre(j.t[k]); if (p) t[p.id] = p; }); return { v: 1, t: t }; }
      catch (e) { return { v: 1, t: {} }; }
    }
    function sauver(etat) { mem = etat; try { if (stock) stock.setItem(CLE, JSON.stringify(etat)); } catch (e) {} abonnes.forEach(function (f) { try { f(); } catch (e) {} }); }
    function id() { return "t" + maintenant().toString(36) + Math.random().toString(36).slice(2, 7); }

    var api = {
      liste: function () {
        var t = lireTout().t;
        return Object.keys(t).map(function (k) { return t[k]; }).filter(function (x) { return !x.supp; }).sort(function (a, b) {
          if (a.fait !== b.fait) return a.fait ? 1 : -1;
          if (a.ech && b.ech && a.ech !== b.ech) return a.ech < b.ech ? -1 : 1;
          if (!!a.ech !== !!b.ech) return a.ech ? -1 : 1;
          return a.maj - b.maj;
        });
      },
      ajouter: function (texte, ech) {
        texte = String(texte || "").trim();
        if (!texte) return null;
        var e = lireTout(), x = { id: id(), texte: texte.slice(0, 300), ech: RE_DATE.test(ech || "") ? ech : "", fait: false, maj: maintenant() };
        e.t[x.id] = x; sauver(e); return x;
      },
      modifier: function (idt, patch) {
        var e = lireTout(), x = e.t[idt];
        if (!x || x.supp) return false;
        if (patch.texte != null) x.texte = String(patch.texte).slice(0, 300);
        if (patch.ech != null) x.ech = RE_DATE.test(patch.ech) ? patch.ech : "";
        if (patch.fait != null) x.fait = !!patch.fait;
        x.maj = Math.max(maintenant(), x.maj + 1); sauver(e); return true;
      },
      basculer: function (idt, fait) { return api.modifier(idt, { fait: fait }); },
      supprimer: function (idt) {
        var e = lireTout(), x = e.t[idt];
        if (!x || x.supp) return false;
        x.supp = true; x.maj = Math.max(maintenant(), x.maj + 1); sauver(e); return true;
      },
      effacerFaites: function () {
        var e = lireTout(), n = 0;
        Object.keys(e.t).forEach(function (k) { var x = e.t[k]; if (x.fait && !x.supp) { x.supp = true; x.maj = Math.max(maintenant(), x.maj + 1); n++; } });
        if (n) sauver(e);
        return n;
      },
      // Fusionne une copie distante (objet ou texte JSON) : la version la plus récente de chaque tâche l'emporte. → true si le local a changé.
      fusionner: function (distant) {
        var d = distant;
        if (typeof d === "string") { try { d = JSON.parse(d); } catch (e) { return false; } }
        if (!d || typeof d !== "object" || !d.t || typeof d.t !== "object") return false;
        var e = lireTout(), change = false;
        Object.keys(d.t).forEach(function (k) {
          var x = propre(d.t[k]);
          if (!x) return;
          var l = e.t[x.id];
          if (!l || x.maj > l.maj) { e.t[x.id] = x; change = true; }
        });
        if (change) sauver(e);
        return change;
      },
      // Texte JSON canonique (clés triées, anciennes pierres tombales purgées) : sert à comparer avec le dépôt.
      serialiser: function () {
        var e = lireTout(), t = {}, limite = maintenant() - PURGE_MS;
        Object.keys(e.t).sort().forEach(function (k) { var x = e.t[k]; if (x.supp && x.maj < limite) return; t[k] = x; });
        return JSON.stringify({ v: 1, t: t }, null, 1) + "\n";
      },
      abonner: function (f) { abonnes.push(f); },
      CLE: CLE
    };
    return api;
  }
  return { creer: creer };
});
