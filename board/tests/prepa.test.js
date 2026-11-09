/* Tests de prepa-logique.js et du dépôt alternatif de depot.js : node tests/prepa.test.js */
var assert = require("assert"), L = require("../js/prepa-logique.js"), D = require("../js/depot.js");
function t(nom, f) { Promise.resolve().then(f).then(function () { console.log("ok  " + nom); }, function (e) { console.log("ÉCHEC " + nom + "\n  " + e.message); process.exitCode = 1; }); }
function mem(init) { var o = Object.assign({}, init || {}); return { getItem: function (k) { return k in o ? o[k] : null; }, setItem: function (k, v) { o[k] = String(v); }, removeItem: function (k) { delete o[k]; } }; }

t("lireEtat : refuse ce qui n'est pas un objet JSON", function () {
  assert.throws(function () { L.lireEtat("pas du json"); });
  assert.throws(function () { L.lireEtat("[]"); });
  assert.deepEqual(L.lireEtat("{}"), {});
});
t("solutions : bascule d'un thème sans toucher aux autres clés", function () {
  var e = L.lireEtat('{"algebre":{"solutions":false,"ticket":["alge-q03"],"ticket_solutions":false,"votes":{"alge-q03":{"vote":0.28}}},"mise-en-situation":{"solutions":false},"inconnue":1}');
  L.fixerSolutions(e, "algebre", true);
  assert.equal(e.algebre.solutions, true); assert.deepEqual(e.algebre.ticket, ["alge-q03"]);
  assert.equal(e["mise-en-situation"].solutions, false); assert.equal(e.inconnue, 1);
  L.fixerSolutions(e, "geometrie", true);                       // thème absent : créé
  assert.deepEqual(e.geometrie, { solutions: true });
  assert.throws(function () { L.fixerSolutions(e, "../x", true); });
});
t("exercices : par catégorie, tout d'un coup, ancienne clé retirée", function () {
  var e = { algebre: { solutions: true, ticket: ["alge-q01"] }, reponses_activees: ["mel-e23"] };
  L.fixerExercices(e, "melange", true);
  assert.deepEqual(e.melange, { exercices: true }); assert.equal("reponses_activees" in e, false);
  assert.equal(L.lire(e, "melange").exercices, true); assert.equal(L.lire(e, "algebre").exercices, false);
  L.fixerExercicesTous(e, ["algebre", "geometrie", "melange"], true);
  assert.equal(e.algebre.exercices, true); assert.equal(e.algebre.solutions, true); assert.deepEqual(e.algebre.ticket, ["alge-q01"]);
  L.fixerExercicesTous(e, ["algebre", "geometrie", "melange"], false);
  assert.equal(e.geometrie.exercices, false); assert.equal(e.melange.exercices, false);
  assert.throws(function () { L.fixerExercices(e, "../x", true); });
});
t("taux : saisies acceptées et refusées", function () {
  assert.equal(L.taux("45"), 0.45); assert.equal(L.taux("45,6 %"), 0.46); assert.equal(L.taux(" 0 "), 0); assert.equal(L.taux("100"), 1);
  assert.equal(L.taux(""), null); assert.equal(L.taux("abc"), null); assert.equal(L.taux("101"), null); assert.equal(L.taux("-3"), null);
  assert.equal(L.affichage(0.28), "28"); assert.equal(L.affichage(undefined), "");
});
t("enregistrerVotes : crée, met à jour, supprime ; ticket dédoublonné", function () {
  var e = {};
  L.enregistrerVotes(e, "algebre", { "alge-q01": { vote: 0.3, revote: null }, "alge-q02": { vote: 0.8 } }, ["alge-q01", "alge-q01"]);
  assert.deepEqual(e.algebre, { votes: { "alge-q01": { vote: 0.3 }, "alge-q02": { vote: 0.8 } }, ticket: ["alge-q01"], solutions: false, ticket_solutions: false });
  L.enregistrerVotes(e, "algebre", { "alge-q01": { vote: 0.3, revote: 0.6 }, "alge-q02": { vote: null } }, []);
  assert.deepEqual(e.algebre.votes, { "alge-q01": { vote: 0.3, revote: 0.6 } });
  assert.deepEqual(e.algebre.ticket, []);
  L.fixerSolutions(e, "algebre", true);
  L.enregistrerVotes(e, "algebre", {}, ["alge-q01"]);           // ne remet pas solutions à faux
  assert.equal(e.algebre.solutions, true);
});
t("proposerTicket : seuil strict, ordre des questions, premier vote seulement", function () {
  var qs = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
  var votes = { a: { vote: 0.2 }, b: { vote: 0.5 }, c: { vote: 0.9, revote: 0.1 }, d: {} };
  assert.deepEqual(L.proposerTicket(qs, votes, 0.5), ["a"]);
  assert.deepEqual(L.proposerTicket(qs, votes, 0.51), ["a", "b"]);
});
t("lire : valeurs par défaut, identifiants invalides écartés", function () {
  var l = L.lire({ algebre: { ticket: ["alge-q01", 5, "x y"] } }, "algebre");
  assert.deepEqual(l, { solutions: false, ticket: ["alge-q01"], ticket_solutions: false, exercices: false, votes: {} });
  assert.equal(L.lire({}, "geometrie").solutions, false);
});
t("serialiser : indentation de deux espaces et saut de ligne final", function () {
  assert.equal(L.serialiser({ a: { b: 1 } }), '{\n  "a": {\n    "b": 1\n  }\n}\n');
});
t("depot : dépôt alternatif, même jeton, écriture avec sha", async function () {
  var appels = [];
  var fetchF = async function (url, o) {
    appels.push({ url: url, methode: o.method, auth: o.headers.Authorization, corps: o.body && JSON.parse(o.body) });
    if (o.method === "GET") return { status: 200, text: async function () { return JSON.stringify({ content: Buffer.from('{"a":1}').toString("base64"), sha: "abc" }); } };
    return { status: 200, text: async function () { return JSON.stringify({ content: { sha: "def" } }); } };
  };
  var stock = mem({ "typweb.sync.v1": JSON.stringify({ depot: "moi/prive", branche: "main" }), "typweb.sync.jeton": "github_pat_secret" });
  var d = D.creer({ stockage: stock, fetch: fetchF, depot: "moi/coursPrepa", branche: "main" });
  assert.equal(d.depot(), "moi/coursPrepa");
  var r = await d.lire("etat.json"); assert.equal(r.sha, "abc"); assert.equal(r.texte, '{"a":1}');
  var w = await d.ecrire("etat.json", '{"a":2}', { sha: r.sha, message: "m" }); assert.equal(w.sha, "def");
  assert.ok(appels[0].url.indexOf("/repos/moi/coursPrepa/contents/etat.json") > 0);
  assert.equal(appels[1].methode, "PUT"); assert.equal(appels[1].corps.sha, "abc"); assert.equal(appels[1].auth, "Bearer github_pat_secret");
  assert.equal(D.creer({ stockage: stock, fetch: fetchF }).depot(), "moi/prive");   // sans option : dépôt de synchronisation inchangé
  assert.equal(D.creer({ stockage: stock, fetch: fetchF, depot: "pas un dépôt" }).depot(), "moi/prive");
});
