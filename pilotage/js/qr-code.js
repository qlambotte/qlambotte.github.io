/* qr-code.js — codes QR (mode octets, versions 1 à 40, correction L/M/Q/H), sans dépendance, hors ligne.
   Portage JavaScript de typweb/moteur/qr.py (même algorithme : tests/qr.test.js compare les deux sorties).
   Sert au lecteur de cartes (P7) : la page de scan du smartphone affiche les votes lus sous forme de QR,
   que la tablette lit ensuite (écran de vote, « Votes par carte » → « Lire le QR »).

   API :
     QrCode.matrice(texte, correction?) → tableau de lignes de booléens (true = noir) ; correction "M" par défaut
     QrCode.svg(texte, { correction?, marge? }) → texte SVG (noir sur blanc, mise à l'échelle par CSS)
   Format des votes : voir QrVotes (lecteur/qr-votes.js). */
(function (racine) {
  "use strict";
  var ECC = {
    L: [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    M: [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
    Q: [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    H: [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30]
  };
  var NB = {
    L: [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
    M: [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
    Q: [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
    H: [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81]
  };
  var FORMAT_ECL = { L: 1, M: 0, Q: 3, H: 2 };

  function modulesBruts(v) {
    var r = (16 * v + 128) * v + 64;
    if (v >= 2) {
      var na = Math.floor(v / 7) + 2;
      r -= (25 * na - 10) * na - 55;
      if (v >= 7) r -= 36;
    }
    return r;
  }
  function motsDonnees(v, ecl) { return Math.floor(modulesBruts(v) / 8) - ECC[ecl][v] * NB[ecl][v]; }
  function gfMul(x, y) {
    var z = 0;
    for (var i = 7; i >= 0; i--) {
      z = (z << 1) ^ ((z >>> 7) * 0x11D);
      z ^= ((y >>> i) & 1) * x;
    }
    return z & 0xFF;
  }
  function rsDiviseur(n) {
    var res = [], i, j, r = 1;
    for (i = 0; i < n - 1; i++) res.push(0);
    res.push(1);
    for (i = 0; i < n; i++) {
      for (j = 0; j < n; j++) {
        res[j] = gfMul(res[j], r);
        if (j + 1 < n) res[j] ^= res[j + 1];
      }
      r = gfMul(r, 2);
    }
    return res;
  }
  function rsReste(donnees, div) {
    var res = div.map(function () { return 0; });
    donnees.forEach(function (b) {
      var f = b ^ res.shift();
      res.push(0);
      div.forEach(function (c, i) { res[i] ^= gfMul(c, f); });
    });
    return res;
  }
  function positionsAlignement(v) {
    if (v === 1) return [];
    var na = Math.floor(v / 7) + 2;
    var pas = Math.ceil((v * 4 + 4) / (na * 2 - 2)) * 2;
    var taille = v * 4 + 17, res = [6], pos = taille - 7;
    while (res.length < na) { res.splice(1, 0, pos); pos -= pas; }
    return res;
  }
  function penalite(m) {
    var n = m.length, p = 0, x, y, i, k;
    var colonnes = [];
    for (x = 0; x < n; x++) { colonnes.push([]); for (y = 0; y < n; y++) colonnes[x].push(m[y][x]); }
    [m, colonnes].forEach(function (lignes) {
      lignes.forEach(function (ligne) {
        k = 1;
        for (i = 1; i <= n; i++) {
          if (i < n && ligne[i] === ligne[i - 1]) k++;
          else { if (k >= 5) p += 3 + (k - 5); k = 1; }
        }
      });
    });
    for (y = 0; y < n - 1; y++) for (x = 0; x < n - 1; x++) {
      var c = m[y][x];
      if (c === m[y][x + 1] && c === m[y + 1][x] && c === m[y + 1][x + 1]) p += 3;
    }
    var motifs = ["10111010000", "00001011101"];
    [m, colonnes].forEach(function (lignes) {
      lignes.forEach(function (ligne) {
        var s = ligne.map(function (b) { return b ? "1" : "0"; }).join("");
        for (i = 0; i < n - 10; i++) { var seg = s.substr(i, 11); if (seg === motifs[0] || seg === motifs[1]) p += 40; }
      });
    });
    var noirs = 0;
    m.forEach(function (l) { l.forEach(function (b) { if (b) noirs++; }); });
    k = Math.floor(Math.abs(noirs * 20 - n * n * 10) / (n * n));
    return p + k * 10;
  }
  var MASQUES = [
    function (x, y) { return (x + y) % 2 === 0; },
    function (x, y) { return y % 2 === 0; },
    function (x, y) { return x % 3 === 0; },
    function (x, y) { return (x + y) % 3 === 0; },
    function (x, y) { return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; },
    function (x, y) { return x * y % 2 + x * y % 3 === 0; },
    function (x, y) { return (x * y % 2 + x * y % 3) % 2 === 0; },
    function (x, y) { return ((x + y) % 2 + x * y % 3) % 2 === 0; }
  ];
  function utf8(texte) {
    if (typeof TextEncoder !== "undefined") return Array.prototype.slice.call(new TextEncoder().encode(texte));
    var s = unescape(encodeURIComponent(texte)), o = [];
    for (var i = 0; i < s.length; i++) o.push(s.charCodeAt(i));
    return o;
  }

  function matrice(texte, correction) {
    var ecl = String(correction || "M").toUpperCase(), donnees = utf8(String(texte)), v, nbCompte;
    for (v = 1; v <= 40; v++) {
      nbCompte = v <= 9 ? 8 : 16;
      if (4 + nbCompte + 8 * donnees.length <= motsDonnees(v, ecl) * 8) break;
    }
    if (v > 40) throw new Error("texte trop long pour un code QR");
    var capacite = motsDonnees(v, ecl) * 8, bits = [];
    function ajouter(val, n) { for (var i = n - 1; i >= 0; i--) bits.push((val >>> i) & 1); }
    ajouter(4, 4); ajouter(donnees.length, nbCompte);
    donnees.forEach(function (b) { ajouter(b, 8); });
    ajouter(0, Math.min(4, capacite - bits.length));
    ajouter(0, ((-bits.length) % 8 + 8) % 8);
    var mots = [], i, j;
    for (i = 0; i < bits.length; i += 8) { var o = 0; for (j = 0; j < 8; j++) o = (o << 1) | bits[i + j]; mots.push(o); }
    var pad = 0xEC;
    while (mots.length < capacite / 8) { mots.push(pad); pad ^= 0xEC ^ 0x11; }
    var nb = NB[ecl][v], ecc = ECC[ecl][v], bruts = Math.floor(modulesBruts(v) / 8);
    var courts = nb - bruts % nb, longCourt = Math.floor(bruts / nb), div = rsDiviseur(ecc), blocs = [], k = 0;
    for (i = 0; i < nb; i++) {
      var n = longCourt - ecc + (i < courts ? 0 : 1), d = mots.slice(k, k + n);
      k += n;
      var e = rsReste(d, div);
      if (i < courts) d = d.concat([0]);
      blocs.push(d.concat(e));
    }
    var final = [];
    for (i = 0; i < blocs[0].length; i++) for (j = 0; j < blocs.length; j++) if (i !== longCourt - ecc || j >= courts) final.push(blocs[j][i]);

    var t = v * 4 + 17, mod = [], fixe = [], x, y;
    for (y = 0; y < t; y++) { mod.push([]); fixe.push([]); for (x = 0; x < t; x++) { mod[y].push(false); fixe[y].push(false); } }
    function poser(px, py, noir) { mod[py][px] = noir; fixe[py][px] = true; }
    for (i = 0; i < t; i++) { poser(6, i, i % 2 === 0); poser(i, 6, i % 2 === 0); }
    [[3, 3], [t - 4, 3], [3, t - 4]].forEach(function (c) {
      for (var dy = -4; dy <= 4; dy++) for (var dx = -4; dx <= 4; dx++) {
        var qx = c[0] + dx, qy = c[1] + dy, dd = Math.max(Math.abs(dx), Math.abs(dy));
        if (qx >= 0 && qx < t && qy >= 0 && qy < t) poser(qx, qy, dd !== 2 && dd !== 4);
      }
    });
    var al = positionsAlignement(v), na = al.length;
    for (i = 0; i < na; i++) for (j = 0; j < na; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === na - 1) || (i === na - 1 && j === 0)) continue;
      for (var dy2 = -2; dy2 <= 2; dy2++) for (var dx2 = -2; dx2 <= 2; dx2++)
        poser(al[i] + dx2, al[j] + dy2, Math.max(Math.abs(dx2), Math.abs(dy2)) !== 1);
    }
    function formatBits(masque) {
      var dval = FORMAT_ECL[ecl] << 3 | masque, r = dval, q;
      for (q = 0; q < 10; q++) r = (r << 1) ^ ((r >>> 9) * 0x537);
      var b = (dval << 10 | r) ^ 0x5412;
      function bit(ii) { return ((b >>> ii) & 1) === 1; }
      for (q = 0; q < 6; q++) poser(8, q, bit(q));
      poser(8, 7, bit(6)); poser(8, 8, bit(7)); poser(7, 8, bit(8));
      for (q = 9; q < 15; q++) poser(14 - q, 8, bit(q));
      for (q = 0; q < 8; q++) poser(t - 1 - q, 8, bit(q));
      for (q = 8; q < 15; q++) poser(8, t - 15 + q, bit(q));
      poser(8, t - 8, true);
    }
    formatBits(0);
    if (v >= 7) {
      var rv = v, q2;
      for (q2 = 0; q2 < 12; q2++) rv = (rv << 1) ^ ((rv >>> 11) * 0x1F25);
      var bv = v << 12 | rv;
      for (q2 = 0; q2 < 18; q2++) {
        var bt = ((bv >>> q2) & 1) === 1, a = t - 11 + q2 % 3, c2 = Math.floor(q2 / 3);
        poser(a, c2, bt); poser(c2, a, bt);
      }
    }
    var ib = 0, droite = t - 1;
    while (droite >= 1) {
      if (droite === 6) droite = 5;
      for (var vert = 0; vert < t; vert++) for (j = 0; j < 2; j++) {
        x = droite - j;
        var montant = ((droite + 1) & 2) === 0;
        y = montant ? t - 1 - vert : vert;
        if (!fixe[y][x] && ib < final.length * 8) { mod[y][x] = ((final[ib >>> 3] >>> (7 - (ib & 7))) & 1) === 1; ib++; }
      }
      droite -= 2;
    }
    var meilleur = null, base = mod.map(function (l) { return l.slice(); });
    for (var mq = 0; mq < 8; mq++) {
      var f = MASQUES[mq];
      for (y = 0; y < t; y++) for (x = 0; x < t; x++) mod[y][x] = base[y][x] !== (!fixe[y][x] && f(x, y));
      formatBits(mq);
      var p = penalite(mod);
      if (!meilleur || p < meilleur.p) meilleur = { p: p, m: mod.map(function (l) { return l.slice(); }) };
      for (y = 0; y < t; y++) mod[y] = base[y].slice();
    }
    return meilleur.m;
  }

  function svg(texte, opt) {
    opt = opt || {};
    var m = matrice(texte, opt.correction || "M"), marge = opt.marge === undefined ? 4 : opt.marge, n = m.length + 2 * marge, d = "";
    m.forEach(function (l, y) { l.forEach(function (noir, x) { if (noir) d += "M" + (x + marge) + " " + (y + marge) + "h1v1h-1z"; }); });
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + n + " " + n + '" shape-rendering="crispEdges" role="img" aria-label="code QR">' +
      '<rect width="' + n + '" height="' + n + '" fill="#fff"/><path d="' + d + '" fill="#000"/></svg>';
  }

  var API = { matrice: matrice, svg: svg };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else racine.QrCode = API;
})(typeof window !== "undefined" ? window : this);
