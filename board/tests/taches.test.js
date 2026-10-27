/* Tests de taches.js et depot.js : node tests/taches.test.js */
var assert = require("assert"), T = require("../js/taches.js"), D = require("../js/depot.js");
var n = 0;
function t(nom, f) { Promise.resolve().then(f).then(function () { n++; console.log("ok  " + nom); }, function (e) { console.log("ÉCHEC " + nom + "\n  " + e.message); process.exitCode = 1; }); }
function mem() { var o = {}; return { getItem: function (k) { return k in o ? o[k] : null; }, setItem: function (k, v) { o[k] = String(v); }, removeItem: function (k) { delete o[k]; } }; }
var temps = 1000000; function now() { return temps++; }

t("ajout, bascule, tri (non faites par échéance, puis faites)", function () {
  var s = T.creer({ stockage: mem(), maintenant: now });
  var a = s.ajouter("sans date"), b = s.ajouter("plus tard", "2026-11-01"), c = s.ajouter("bientôt", "2026-10-25");
  assert.deepEqual(s.liste().map(function (x) { return x.texte; }), ["bientôt", "plus tard", "sans date"]);
  s.basculer(c.id, true);
  assert.deepEqual(s.liste().map(function (x) { return x.texte; }), ["plus tard", "sans date", "bientôt"]);
  assert.equal(s.ajouter("   "), null);
});
t("suppression : pierre tombale, absente de la liste, gardée dans l'export", function () {
  var s = T.creer({ stockage: mem(), maintenant: now }), a = s.ajouter("x");
  s.supprimer(a.id);
  assert.equal(s.liste().length, 0);
  assert.ok(JSON.parse(s.serialiser()).t[a.id].supp);
});
t("fusion : la version la plus récente gagne, une suppression ne ressuscite pas", function () {
  var A = T.creer({ stockage: mem(), maintenant: now }), B = T.creer({ stockage: mem(), maintenant: now });
  var x = A.ajouter("tâche"), y = A.ajouter("autre");
  B.fusionner(A.serialiser());
  assert.equal(B.liste().length, 2);
  A.modifier(y.id, { texte: "autre modifiée" });            // modifiée d'abord…
  B.basculer(x.id, true); B.supprimer(y.id);                 // …puis supprimée sur B : la suppression, plus récente, l'emporte
  assert.equal(A.fusionner(B.serialiser()), true);
  var l = A.liste();
  assert.equal(l.length, 1); assert.ok(l[0].fait);
  A.modifier(x.id, { texte: "x2" });                           // une modif locale plus récente que la copie de B résiste à une nouvelle fusion
  A.fusionner(B.serialiser()); assert.equal(A.liste()[0].texte, "x2");
});
t("fusion : entrées invalides ignorées, canonique stable", function () {
  var s = T.creer({ stockage: mem(), maintenant: now });
  assert.equal(s.fusionner("pas du json"), false);
  assert.equal(s.fusionner({ t: { "../x": { id: "../x", texte: "mal", maj: 5 }, ok: { id: "ok", texte: "bien", ech: "n'importe quoi", maj: 5 } } }), true);
  assert.equal(s.liste().length, 1); assert.equal(s.liste()[0].ech, "");
  assert.equal(s.serialiser(), s.serialiser());
});
t("depot : lecture, écriture avec sha, jeton chiffré verrouillé puis déverrouillé", async function () {
  var stock = mem(), appels = [];
  stock.setItem("typweb.sync.v1", JSON.stringify({ depot: "moi/suivi-classes", branche: "main" }));
  var cw = require("crypto").webcrypto, phrase = "phrase-secrete", sel = cw.getRandomValues(new Uint8Array(16)), iv = cw.getRandomValues(new Uint8Array(12));
  function b64(o) { return Buffer.from(o).toString("base64"); }
  var base = await cw.subtle.importKey("raw", new TextEncoder().encode(phrase), "PBKDF2", false, ["deriveKey"]);
  var cle = await cw.subtle.deriveKey({ name: "PBKDF2", salt: sel, iterations: 1000, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt"]);
  var ct = new Uint8Array(await cw.subtle.encrypt({ name: "AES-GCM", iv: iv }, cle, new TextEncoder().encode("github_pat_SECRET")));
  stock.setItem("typweb.sync.jeton", JSON.stringify({ v: 1, chiffre: true, iter: 1000, sel: b64(sel), iv: b64(iv), ct: b64(ct) }));
  var fichiers = { "unif/taches.json": { texte: '{"v":1,"t":{}}', sha: "abc" } };
  var fetchF = async function (url, o) {
    appels.push({ url: url, o: o });
    var ch = decodeURIComponent(url.split("/contents/")[1].split("?")[0]);
    if (o.method === "GET") { var f = fichiers[ch]; return f ? { status: 200, text: async function () { return JSON.stringify({ content: Buffer.from(f.texte).toString("base64"), sha: f.sha }); } } : { status: 404, text: async function () { return '{"message":"Not Found"}'; } }; }
    var corps = JSON.parse(o.body); fichiers[ch] = { texte: Buffer.from(corps.content, "base64").toString(), sha: "n" + appels.length };
    return { status: 200, text: async function () { return JSON.stringify({ content: { sha: fichiers[ch].sha } }); } };
  };
  var d = D.creer({ stockage: stock, fetch: fetchF, crypto: cw });
  assert.ok(d.configure()); assert.ok(d.verrouille());
  await assert.rejects(d.lire("unif/taches.json"), function (e) { return e.code === "verrouille"; });
  await assert.rejects(d.deverrouiller("mauvaise"), function (e) { return e.code === "phrase"; });
  await d.deverrouiller(phrase);
  assert.ok(!d.verrouille());
  var r = await d.lire("unif/taches.json"); assert.equal(r.sha, "abc");
  assert.equal(await d.lire("unif/absent.json"), null);
  var w = await d.ecrire("unif/horaire.json", "é à ü", { sha: null });
  assert.ok(w.sha);
  assert.equal((await d.lire("unif/horaire.json")).texte, "é à ü");
  assert.equal(appels[0].o.headers.Authorization, "Bearer github_pat_SECRET");
  await assert.rejects(d.lire("../secret"), function (e) { return e.code === "config"; });
});
setTimeout(function () { console.log(n + " tests réussis"); }, 300);
