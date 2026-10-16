/* lecteur-aruco.js — détecteur de marqueurs ArUco 4x4 (dictionnaire 50 identifiants), sans dépendance.
   Écrit pour le lecteur de cartes de vote (P7) : fonctionne hors ligne, tout reste en mémoire.

   Dictionnaire : 4x4_50 d'OpenCV (DICT_4X4_50). Distance de Hamming minimale entre deux marqueurs,
   rotations comprises : 4, d'où correction d'une erreur de lecture au plus.

   Marqueur = grille 6x6 (bord noir d'une cellule + 4x4 cellules de données). Convention du code
   (16 bits, première cellule = bit de poids fort, lecture ligne par ligne) : 1 = cellule blanche.

   Carte de vote : la lettre A est du côté du haut du marqueur, B du côté droit, C du bas, D du côté gauche.
   L'élève lève la carte avec SA RÉPONSE VERS LE HAUT : la lettre lue est celle dont le côté est en haut de l'image.

   API :
     LecteurAruco.creer(options) → détecteur ; détecteur.detecter(gris, largeur, hauteur) → [détection]
     LecteurAruco.versGris(rgba, largeur, hauteur, sortie?) → Uint8Array (niveaux de gris)
     LecteurAruco.cellules(id) → grille 6x6, 1 = noir (pour dessiner une carte)
     LecteurAruco.CODES, LecteurAruco.NB_ID
   Détection : { id, lettre: "A".."D", angle (écart en degrés à la verticale, -45..45), coins: [{x,y}×4] (HG,HD,BD,BG
   dans le repère du marqueur), centre: {x,y}, taille (côté moyen, pixels), erreurs (bits corrigés),
   contraste (0..255), niveau (échelle de détection : 0 = pleine résolution) }. */
(function (racine) {
  "use strict";

  var CODES = [46386, 3994, 13101, 39238, 21662, 31181, 40494, 50418, 65242, 53078, 63889, 4519, 3767, 10767, 9393, 9790, 18021, 26112, 27742, 30383, 34443, 45099, 52437, 56706, 65095, 38001, 44260, 42324, 8483, 13423, 17429, 22450, 40655, 61643, 2222, 2345, 6261, 1279, 3574, 7258, 5912, 10792, 12940, 14514, 9448, 12011, 11583, 19300, 20526, 20499];
  var NB_ID = CODES.length;

  function popcount(x) { x = x - ((x >> 1) & 0x5555); x = (x & 0x3333) + ((x >> 2) & 0x3333); x = (x + (x >> 4)) & 0x0f0f; return (x + (x >> 8)) & 0x1f; }

  function cellules(id) {
    var c = CODES[id], g = [], r, k;
    for (r = 0; r < 6; r++) { g.push([1, 1, 1, 1, 1, 1]); }
    for (k = 0; k < 16; k++) { g[1 + (k >> 2)][1 + (k & 3)] = ((c >> (15 - k)) & 1) ? 0 : 1; }
    return g;
  }

  function versGris(rgba, w, h, sortie) {
    var n = w * h, g = sortie && sortie.length >= n ? sortie : new Uint8Array(n), i, j = 0;
    for (i = 0; i < n; i++, j += 4) { g[i] = (rgba[j] * 77 + rgba[j + 1] * 150 + rgba[j + 2] * 29) >> 8; }
    return g;
  }

  function reduire3(src, w, h, dst) {
    var w2 = (w / 3) | 0, h2 = (h / 3) | 0, x, y, s, i;
    for (y = 0; y < h2; y++) {
      i = y * 3 * w;
      for (x = 0; x < w2; x++, i += 3) {
        s = src[i] + src[i + 1] + src[i + 2] + src[i + w] + src[i + w + 1] + src[i + w + 2] + src[i + 2 * w] + src[i + 2 * w + 1] + src[i + 2 * w + 2];
        dst[y * w2 + x] = (s / 9) | 0;
      }
    }
    return { img: dst, w: w2, h: h2 };
  }

  // Homographie carré unité → quadrilatère (HG, HD, BD, BG)
  function homographie(p) {
    var x0 = p[0].x, y0 = p[0].y, x1 = p[1].x, y1 = p[1].y, x2 = p[2].x, y2 = p[2].y, x3 = p[3].x, y3 = p[3].y;
    var dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3, dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3;
    var a, b, d, e, g, h, den;
    if (Math.abs(dx3) < 1e-9 && Math.abs(dy3) < 1e-9) { g = 0; h = 0; a = x1 - x0; b = x3 - x0; d = y1 - y0; e = y3 - y0; }
    else {
      den = dx1 * dy2 - dy1 * dx2; if (Math.abs(den) < 1e-9) return null;
      g = (dx3 * dy2 - dy3 * dx2) / den; h = (dx1 * dy3 - dy1 * dx3) / den;
      a = x1 - x0 + g * x1; b = x3 - x0 + h * x3; d = y1 - y0 + g * y1; e = y3 - y0 + h * y3;
    }
    return { a: a, b: b, c: x0, d: d, e: e, f: y0, g: g, h: h };
  }

  function echantillon(img, w, h, H, u, v) {
    var k = H.g * u + H.h * v + 1, x = (H.a * u + H.b * v + H.c) / k, y = (H.d * u + H.e * v + H.f) / k;
    if (x < 0 || y < 0 || x > w - 1 || y > h - 1) return -1;
    var x0 = x | 0, y0 = y | 0, x1 = x0 + 1 < w ? x0 + 1 : x0, y1 = y0 + 1 < h ? y0 + 1 : y0, fx = x - x0, fy = y - y0;
    return (img[y0 * w + x0] * (1 - fx) + img[y0 * w + x1] * fx) * (1 - fy) + (img[y1 * w + x0] * (1 - fx) + img[y1 * w + x1] * fx) * fy;
  }

  function creer(options) {
    var opt = options || {};
    var FEN = opt.fenetre || 15;          // demi-fenêtre du seuil adaptatif (31 px)
    var C = opt.constante == null ? 8 : opt.constante;
    var NIV = opt.niveaux || 3;           // pleine résolution, /3, /9
    var COTE_MIN = opt.coteMin || 14;     // côté minimal du carré, en pixels du niveau
    var ERR_MAX = opt.erreursMax == null ? 1 : opt.erreursMax;
    var CONTRASTE_MIN = opt.contrasteMin || 40;
    var tampons = {};

    function buf(nom, type, n) {
      var b = tampons[nom];
      if (!b || b.length < n) { b = tampons[nom] = new type(n); }
      return b;
    }

    function binariser(img, w, h) {
      var W1 = w + 1, I = buf("integ", Int32Array, W1 * (h + 1)), bin = buf("bin", Uint8Array, w * h), x, y, s, i, ii;
      for (x = 0; x <= w; x++) I[x] = 0;
      for (y = 1; y <= h; y++) {
        s = 0; I[y * W1] = 0; i = (y - 1) * w;
        for (x = 1; x <= w; x++) { s += img[i + x - 1]; I[y * W1 + x] = I[(y - 1) * W1 + x] + s; }
      }
      for (y = 0; y < h; y++) {
        var ya = y - FEN < 0 ? 0 : y - FEN, yb = y + FEN >= h ? h - 1 : y + FEN;
        for (x = 0; x < w; x++) {
          var xa = x - FEN < 0 ? 0 : x - FEN, xb = x + FEN >= w ? w - 1 : x + FEN;
          var somme = I[(yb + 1) * W1 + xb + 1] - I[ya * W1 + xb + 1] - I[(yb + 1) * W1 + xa] + I[ya * W1 + xa];
          var aire = (xb - xa + 1) * (yb - ya + 1);
          ii = y * w + x;
          bin[ii] = (img[ii] + C) * aire < somme ? 1 : 0;
        }
      }
      return bin;
    }

    // composantes connexes (4-voisinage) des pixels sombres ; renvoie les candidats
    function composantes(bin, w, h) {
      var n = w * h, lab = buf("lab", Int32Array, n), par = buf("par", Int32Array, (n >> 1) + 2);
      var nl = 0, x, y, i, a, b, ra, rb;
      function racine(k) { while (par[k] !== k) { par[k] = par[par[k]]; k = par[k]; } return k; }
      for (y = 0; y < h; y++) {
        for (x = 0; x < w; x++) {
          i = y * w + x;
          if (!bin[i]) { lab[i] = 0; continue; }
          a = x > 0 ? lab[i - 1] : 0; b = y > 0 ? lab[i - w] : 0;
          if (!a && !b) { nl++; par[nl] = nl; lab[i] = nl; }
          else if (a && !b) lab[i] = a;
          else if (!a && b) lab[i] = b;
          else { ra = racine(a); rb = racine(b); if (ra < rb) { par[rb] = ra; lab[i] = ra; } else { par[ra] = rb; lab[i] = rb; } }
        }
      }
      var cnt = buf("cnt", Int32Array, nl + 1), mnx = buf("mnx", Int32Array, nl + 1), mxx = buf("mxx", Int32Array, nl + 1),
          mny = buf("mny", Int32Array, nl + 1), mxy = buf("mxy", Int32Array, nl + 1), k;
      for (k = 0; k <= nl; k++) { cnt[k] = 0; mnx[k] = 1e9; mxx[k] = -1; mny[k] = 1e9; mxy[k] = -1; }
      for (y = 0; y < h; y++) {
        for (x = 0; x < w; x++) {
          i = y * w + x; a = lab[i]; if (!a) continue;
          a = racine(a); lab[i] = a; cnt[a]++;
          if (x < mnx[a]) mnx[a] = x; if (x > mxx[a]) mxx[a] = x; if (y < mny[a]) mny[a] = y; if (y > mxy[a]) mxy[a] = y;
        }
      }
      var cand = [], bw, bh, rap;
      for (k = 1; k <= nl; k++) {
        if (!cnt[k] || par[k] !== k) continue;
        bw = mxx[k] - mnx[k] + 1; bh = mxy[k] - mny[k] + 1;
        if (bw < COTE_MIN || bh < COTE_MIN * 0.7) continue;
        if (bw > w * 0.95 || bh > h * 0.95) continue;
        if (bw > 3 * bh || bh > 3 * bw) continue;
        rap = cnt[k] / (bw * bh);
        if (rap < 0.22 || rap > 0.97) continue;
        cand.push({ lab: k, n: cnt[k], x0: mnx[k], x1: mxx[k], y0: mny[k], y1: mxy[k] });
      }
      return { lab: lab, cand: cand };
    }

    var DIRS = [];
    (function () { for (var k = 0; k < 16; k++) DIRS.push([Math.cos(k * Math.PI / 8), Math.sin(k * Math.PI / 8)]); })();

    function quadrilatere(lab, w, c) {
      var best = new Float64Array(16), px = new Int32Array(16), py = new Int32Array(16), k, x, y, p, v;
      for (k = 0; k < 16; k++) best[k] = -1e18;
      for (y = c.y0; y <= c.y1; y++) {
        for (x = c.x0; x <= c.x1; x++) {
          if (lab[y * w + x] !== c.lab) continue;
          for (k = 0; k < 16; k++) { v = x * DIRS[k][0] + y * DIRS[k][1]; if (v > best[k]) { best[k] = v; px[k] = x; py[k] = y; } }
        }
      }
      var pts = [];
      for (k = 0; k < 16; k++) { if (!pts.length || pts[pts.length - 1].x !== px[k] || pts[pts.length - 1].y !== py[k]) pts.push({ x: px[k], y: py[k] }); }
      if (pts.length > 1 && pts[0].x === pts[pts.length - 1].x && pts[0].y === pts[pts.length - 1].y) pts.pop();
      var i, j, m, aire, mini, minA;
      function tri(a, b, d) { return Math.abs((b.x - a.x) * (d.y - a.y) - (d.x - a.x) * (b.y - a.y)) / 2; }
      while (pts.length > 4) {
        m = pts.length; minA = 1e18; mini = 0;
        for (i = 0; i < m; i++) { aire = tri(pts[(i + m - 1) % m], pts[i], pts[(i + 1) % m]); if (aire < minA) { minA = aire; mini = i; } }
        pts.splice(mini, 1);
      }
      if (pts.length < 4) return null;
      // sens horaire dans l'image (y vers le bas) : aire signée positive
      var s = 0; for (i = 0; i < 4; i++) { j = (i + 1) & 3; s += pts[i].x * pts[j].y - pts[j].x * pts[i].y; }
      if (s < 0) { pts.reverse(); s = -s; }
      // convexité
      for (i = 0; i < 4; i++) {
        var a0 = pts[i], a1 = pts[(i + 1) & 3], a2 = pts[(i + 2) & 3];
        if ((a1.x - a0.x) * (a2.y - a1.y) - (a1.y - a0.y) * (a2.x - a1.x) <= 0) return null;
      }
      var aireQ = s / 2;
      if (c.n / aireQ < 0.42 || c.n / aireQ > 1.15) return null;
      var cotes = []; for (i = 0; i < 4; i++) { j = (i + 1) & 3; cotes.push(Math.hypot(pts[j].x - pts[i].x, pts[j].y - pts[i].y)); }
      var mn = Math.min.apply(null, cotes), mx = Math.max.apply(null, cotes);
      if (mn < COTE_MIN * 0.7 || mx > 3.2 * mn) return null;
      return pts;
    }

    function lire(gris, w, h, quad, echelle) {
      // quad : coins en pixels du niveau → pleine résolution
      var q = [], i, k, r, c;
      for (i = 0; i < 4; i++) q.push({ x: (quad[i].x + 0.5) * echelle - 0.5, y: (quad[i].y + 0.5) * echelle - 0.5 });
      var H = homographie(q); if (!H) return null;
      var B = [], vals = [], d = 0.18;
      for (r = 0; r < 6; r++) {
        B.push([]);
        for (c = 0; c < 6; c++) {
          var s = 0, nn = 0, du, dv, e;
          for (du = -1; du <= 1; du++) for (dv = -1; dv <= 1; dv++) {
            e = echantillon(gris, w, h, H, (c + 0.5 + du * d) / 6, (r + 0.5 + dv * d) / 6);
            if (e >= 0) { s += e; nn++; }
          }
          if (nn < 5) return null;
          B[r].push(s / nn);
        }
      }
      // noir de référence : cellules du bord ; blanc de référence : couronne à l'extérieur du carré
      var noir = 0; for (k = 0; k < 6; k++) noir += B[0][k] + B[5][k] + (k > 0 && k < 5 ? B[k][0] + B[k][5] : 0);
      noir /= 20;
      var ext = [], t, e2;
      for (t = 0; t < 12; t++) {
        var pos = t / 12 * 4, cote = pos | 0, f = pos - cote, uu, vv, o = -0.45 / 6;
        if (cote === 0) { uu = f; vv = o; } else if (cote === 1) { uu = 1 - o; vv = f; } else if (cote === 2) { uu = 1 - f; vv = 1 - o; } else { uu = o; vv = 1 - f; }
        e2 = echantillon(gris, w, h, H, uu, vv); if (e2 >= 0) ext.push(e2);
      }
      if (ext.length < 6) return null;
      ext.sort(function (a, b) { return a - b; });
      var blanc = ext[(ext.length * 0.75) | 0];
      var contraste = blanc - noir;
      if (contraste < CONTRASTE_MIN) return null;
      var seuil = blanc * 0.5, mauvais = 0;
      if (noir > blanc * 0.4) return null;     // le bord doit être franchement plus sombre que la marge
      // la marge blanche de la carte doit entourer le carré (rejette les lettres, mains, ombres)
      var sombres = 0; for (k = 0; k < ext.length; k++) { if (ext[k] < seuil) sombres++; }
      if (sombres > 2) return null;
      for (k = 0; k < 6; k++) {
        if (B[0][k] > seuil) mauvais++; if (B[5][k] > seuil) mauvais++;
        if (k > 0 && k < 5) { if (B[k][0] > seuil) mauvais++; if (B[k][5] > seuil) mauvais++; }
      }
      if (mauvais > 2) return null;
      // le bord noir doit être continu : 10 points le long du milieu de chacun des 4 côtés
      var rates = 0, t2, e3, m = 0.5 / 6, p2;
      for (t2 = 0; t2 < 10; t2++) {
        p2 = (1 + 4 * (t2 + 0.5) / 10) / 6;
        e3 = echantillon(gris, w, h, H, p2, m); if (e3 > seuil) rates++;
        e3 = echantillon(gris, w, h, H, p2, 1 - m); if (e3 > seuil) rates++;
        e3 = echantillon(gris, w, h, H, m, p2); if (e3 > seuil) rates++;
        e3 = echantillon(gris, w, h, H, 1 - m, p2); if (e3 > seuil) rates++;
      }
      if (rates > 3) return null;
      var G = B, rot, code, id, bits, err, meilleur = null;
      for (rot = 0; rot < 4; rot++) {
        code = 0;
        for (r = 1; r < 5; r++) for (c = 1; c < 5; c++) code = (code << 1) | (G[r][c] > seuil ? 1 : 0);
        for (id = 0; id < NB_ID; id++) {
          err = popcount(code ^ CODES[id]);
          if (err <= ERR_MAX && (!meilleur || err < meilleur.err)) meilleur = { id: id, rot: rot, err: err, mauvais: mauvais };
        }
        if (meilleur) break;
        var N = []; for (r = 0; r < 6; r++) { N.push([]); for (c = 0; c < 6; c++) N[r].push(G[c][5 - r]); }
        G = N;
      }
      if (!meilleur || meilleur.err + mauvais > 1) return null;   // au plus une cellule douteuse, bord compris
      var coins = [q[meilleur.rot & 3], q[(meilleur.rot + 1) & 3], q[(meilleur.rot + 2) & 3], q[(meilleur.rot + 3) & 3]];
      return { id: meilleur.id, erreurs: meilleur.err, contraste: Math.round(contraste), coins: coins };
    }

    function orienter(det) {
      var c = det.coins, ux = ((c[0].x - c[3].x) + (c[1].x - c[2].x)) / 2, uy = ((c[0].y - c[3].y) + (c[1].y - c[2].y)) / 2;
      var theta = Math.atan2(ux, -uy) * 180 / Math.PI;     // 0 : haut du marqueur vers le haut de l'image ; + : vers la droite
      var lettre, ecart;
      if (theta > -45 && theta <= 45) { lettre = "A"; ecart = theta; }
      else if (theta > 45 && theta <= 135) { lettre = "D"; ecart = theta - 90; }
      else if (theta > -135 && theta <= -45) { lettre = "B"; ecart = theta + 90; }
      else { lettre = "C"; ecart = theta > 0 ? theta - 180 : theta + 180; }
      det.lettre = lettre; det.angle = Math.round(ecart * 10) / 10;
      var cx = 0, cy = 0, i, t = 0;
      for (i = 0; i < 4; i++) { cx += c[i].x / 4; cy += c[i].y / 4; t += Math.hypot(c[(i + 1) & 3].x - c[i].x, c[(i + 1) & 3].y - c[i].y) / 4; }
      det.centre = { x: cx, y: cy }; det.taille = t;
      return det;
    }

    function detecter(gris, w, h) {
      var res = [], niv, img = gris, cw = w, ch = h, echelle = 1, k, i, c, q, d, doublon, j;
      for (niv = 0; niv < NIV; niv++) {
        if (niv > 0) {
          var r = reduire3(img, cw, ch, buf("pyr" + niv, Uint8Array, ((cw / 3) | 0) * ((ch / 3) | 0)));
          img = r.img; cw = r.w; ch = r.h; echelle *= 3;
        }
        if (cw < 3 * COTE_MIN || ch < 3 * COTE_MIN) break;
        var bin = binariser(img, cw, ch), comp = composantes(bin, cw, ch);
        for (k = 0; k < comp.cand.length; k++) {
          c = comp.cand[k]; q = quadrilatere(comp.lab, cw, c); if (!q) continue;
          d = lire(gris, w, h, q, echelle); if (!d) continue;
          d.niveau = niv; orienter(d);
          doublon = false;
          for (j = 0; j < res.length; j++) {
            if (res[j].id === d.id && Math.hypot(res[j].centre.x - d.centre.x, res[j].centre.y - d.centre.y) < 0.6 * Math.max(res[j].taille, d.taille)) { doublon = true; break; }
          }
          if (!doublon) res.push(d);
        }
      }
      return res.filter(function (a) { return !dansUneCarte(a, res); });
    }

    // Une lettre ou un chiffre imprimé sur la carte peut ressembler à un petit marqueur : on écarte tout
    // candidat nettement plus petit dont le centre tombe sur la carte (A4, marqueur centré) d'un autre.
    function dansUneCarte(a, tous) {
      var j, b, H, pts, i, p, ok, k, s, x, y, hx, hy;
      var U = [[-0.12, -0.38], [1.12, -0.38], [1.12, 1.38], [-0.12, 1.38]];
      for (j = 0; j < tous.length; j++) {
        b = tous[j];
        if (b === a || b.taille < 2 * a.taille) continue;
        H = homographie(b.coins); if (!H) continue;
        pts = [];
        for (i = 0; i < 4; i++) {
          k = H.g * U[i][0] + H.h * U[i][1] + 1;
          pts.push({ x: (H.a * U[i][0] + H.b * U[i][1] + H.c) / k, y: (H.d * U[i][0] + H.e * U[i][1] + H.f) / k });
        }
        ok = true; x = a.centre.x; y = a.centre.y;
        for (i = 0; i < 4; i++) {
          s = (pts[(i + 1) & 3].x - pts[i].x) * (y - pts[i].y) - (pts[(i + 1) & 3].y - pts[i].y) * (x - pts[i].x);
          if (s < 0) { ok = false; break; }
        }
        if (ok) return true;
      }
      return false;
    }

    return { detecter: detecter };
  }

  var API = { creer: creer, versGris: versGris, cellules: cellules, CODES: CODES, NB_ID: NB_ID };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  racine.LecteurAruco = API;
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this));
