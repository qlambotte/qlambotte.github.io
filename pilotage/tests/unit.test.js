const test = require("node:test"), assert = require("node:assert/strict");
const { O, C, H, E, T, JN, ET, config, indexL, banques, ev, t, ids, J, X } = require("./aide.js");
const cfg = config.config;
const instant = iso => new Date(iso);

/* ---------------- configuration ---------------- */
test("config.json livré est valide et contient l'horaire", () => {
  assert.equal(config.ok, true, config.erreurs.join("\n"));
  assert.equal(cfg.creneaux.length, 4);
  assert.deepEqual(cfg.classes.map(c => [c.code, c.niveau, c.effectif]), [["5TTy", "5e", 20], ["6TTi", "6e", 20]]);
});
test("config invalide : messages lisibles, un par problème", () => {
  const r = C.valider({ classes: [{ code: "5TTy", niveau: "5e", effectif: 20 }, { code: "5TTy", niveau: "7e", effectif: -1 }],
    creneaux: [{ jour: "lundi", debut: "14:00", fin: "13:00", classe: "9ZZ", local: "1" }], conges: [{ du: "2026-11-02", au: "2026-11-01" }],
    interros: [{ date: "2026-13-01", classe: "5TTy", uaa: "", type: "x" }], fuseau: "Mars/Olympus" });
  assert.equal(r.ok, false);
  const txt = r.erreurs.join("\n");
  for (const m of ["fuseau", "apparaît deux fois", "niveau", "effectif", "doit précéder la fin", "n'existe pas dans classes", "après « au »", "interros[0].date", "interros[0].uaa"]) assert.match(txt, new RegExp(m.replace(/[()[\]]/g, "\\$&")), m);
});
test("config : JSON cassé et objet absent", () => {
  assert.match(C.valider("{ pas du json").erreurs[0], /pas un JSON valide/);
  assert.equal(C.valider("[]").ok, false);
  assert.equal(C.valider({ classes: [] }).ok, false);
});
test("config : cours mal formé, url sans slash, coursEnCours inconnu", () => {
  const r = C.valider({ classes: [{ code: "A", niveau: "5e", effectif: 1, coursEnCours: "X", cours: [{ uaa: "5UAA3", titre: "t", url: "https://a.b/c", index: "i", classe: "c" }] }], creneaux: [] });
  assert.match(r.erreurs.join("\n"), /terminée par « \/ »/);
  assert.match(r.erreurs.join("\n"), /coursEnCours/);
});

/* ---------------- détection de la classe ---------------- */
// [jour, ISO du lundi/jeudi/vendredi 2026-10-xx, début, fin, classe]
const CRENEAUX = [["lundi", "2026-10-12", "12:40", "14:20", "6TTi"], ["jeudi", "2026-10-15", "10:10", "11:50", "5TTy"],
                  ["vendredi", "2026-10-16", "11:00", "12:40", "6TTi"], ["vendredi", "2026-10-16", "14:20", "16:00", "5TTy"]];
const hhmm = (min) => O.p2(Math.floor(min / 60)) + ":" + O.p2(min % 60);
for (const [jour, date, d, f, classe] of CRENEAUX) {
  test(`détection ${jour} ${d}–${f} (${classe}) : bornes −15 / +10 comprises, −16 / +11 exclues`, () => {
    const at = m => H.detecter(cfg, instant(`${date}T${hhmm(m)}:00+02:00`));
    assert.equal(at(O.minutes(d) - 16), null);
    assert.equal(at(O.minutes(d) - 15).classe, classe);
    assert.equal(at(O.minutes(d)).classe, classe);
    assert.equal(at(O.minutes(f)).classe, classe);
    assert.equal(at(O.minutes(f) + 10).classe, classe);
    assert.equal(at(O.minutes(f) + 11), null);
  });
}
test("détection : local et créneau renvoyés", () => {
  const c = H.detecter(cfg, instant("2026-10-15T10:00:00+02:00"));
  assert.deepEqual([c.classe, c.local, c.debut, c.fin], ["5TTy", "2407", "10:10", "11:50"]);
});
test("détection : jour sans cours, week-end, dimanche", () => {
  for (const d of ["2026-10-13", "2026-10-14", "2026-10-17", "2026-10-18"]) assert.equal(H.detecter(cfg, instant(`${d}T12:00:00+02:00`)), null, d);
});
test("détection : le fuseau est celui de la config, pas celui de la machine (22:40 UTC = 00:40 Bruxelles)", () => {
  assert.equal(H.detecter(cfg, instant("2026-10-15T08:00:00Z")).classe, "5TTy");          // 10:00 à Bruxelles (UTC+2)
  assert.equal(H.detecter(cfg, instant("2026-10-15T10:30:00Z")), null);                   // 12:30 à Bruxelles
});
test("détection : heure d'hiver (passage au 25 octobre 2026) — lundi 26 octobre, UTC+1", () => {
  assert.equal(H.detecter(cfg, instant("2026-10-26T12:25:00+01:00")).classe, "6TTi");
  assert.equal(H.detecter(cfg, instant("2026-10-26T12:24:00+01:00")), null);               // 15 min − 1
  assert.equal(H.detecter(cfg, instant("2026-10-26T12:24:00+02:00")) /* 11:24 locale */, null);
});
test("détection : congé (jour isolé et période) empêche la détection", () => {
  const avecConge = Object.assign({}, cfg, { conges: [{ du: "2026-10-12", au: "2026-10-12" }, { du: "2026-10-26", au: "2026-11-01" }] });
  assert.equal(H.detecter(avecConge, instant("2026-10-12T13:00:00+02:00")), null);
  assert.equal(H.detecter(avecConge, instant("2026-10-26T13:00:00+01:00")), null);
  assert.equal(H.detecter(avecConge, instant("2026-11-02T13:00:00+01:00")).classe, "6TTi");
  assert.equal(H.detecter(cfg, instant("2026-10-12T13:00:00+02:00")).classe, "6TTi");
});
test("prochaine séance : hors créneau", () => {
  let p = H.prochaine(cfg, instant("2026-10-12T15:00:00+02:00"));              // lundi après le cours
  assert.deepEqual([p.ymd, p.creneau.classe, p.creneau.local], ["2026-10-15", "5TTy", "2407"]);
  assert.equal(H.libelleSeance(p), "jeudi 15/10, 10h10–11h50, local 2407");
  p = H.prochaine(cfg, instant("2026-10-12T12:10:00+02:00"));                  // lundi 12:10 : fenêtre pas encore ouverte (12:25)
  assert.deepEqual([p.ymd, p.creneau.classe], ["2026-10-12", "6TTi"]);
  p = H.prochaine(cfg, instant("2026-10-16T16:30:00+02:00"));                  // vendredi soir → lundi
  assert.deepEqual([p.ymd, p.creneau.classe], ["2026-10-19", "6TTi"]);
  p = H.prochaine(cfg, instant("2026-10-16T12:50:00+02:00"));                  // entre deux cours le vendredi
  assert.deepEqual([p.ymd, p.creneau.classe], ["2026-10-16", "5TTy"]);
});
test("prochaine séance : saute les congés ; aucune séance → null", () => {
  const c = Object.assign({}, cfg, { conges: [{ du: "2026-10-15", au: "2026-10-18" }] });
  assert.equal(H.prochaine(c, instant("2026-10-12T15:00:00+02:00")).ymd, "2026-10-19");
  assert.equal(H.prochaine(Object.assign({}, cfg, { creneaux: [] }), instant("2026-10-12T15:00:00+02:00")), null);
});

/* ---------------- journal : fonctions pures ---------------- */
test("ev.etat : dernier événement gagne, annule retire, état à un instant donné", () => {
  const e = [ev("2026-10-08T10:20+02:00", "5TTy", "5UAA3.def.001"), ev("2026-10-08T10:25+02:00", "5TTy", "5UAA3.def.001", "annule"),
             ev("2026-10-08T10:30+02:00", "5TTy", "5UAA3.def.002"), ev("2026-10-08T10:31+02:00", "6TTi", "5UAA3.def.009")];
  assert.deepEqual(Object.keys(E.etat(e, "5TTy")), ["5UAA3.def.002"]);
  assert.deepEqual(Object.keys(E.etat(e, "5TTy", O.FUSEAU, t("2026-10-08T10:22+02:00"))), ["5UAA3.def.001"]);
  assert.deepEqual(Object.keys(E.etat(e, "6TTi")), ["5UAA3.def.009"]);
});
test("ev.poses / aReprendre / échauffements : dernier événement d'une session gagne", () => {
  const e = [ev("2026-10-08T10:20+02:00", "5TTy", "echauffement", "echauffement", { sid: "s1", items: [{ id: "5UAA2.c.001", niveau: 1 }, { id: "5UAA2.c.002", niveau: 0 }] }),
             ev("2026-10-08T10:30+02:00", "5TTy", "echauffement", "echauffement", { sid: "s1", items: [{ id: "5UAA2.c.001", niveau: 2 }, { id: "5UAA2.c.002", niveau: 0 }] }),
             ev("2026-10-08T10:40+02:00", "5TTy", "5UAA3.c.001", "vote", { sid: "v1", manche: 1 }), ev("2026-10-08T10:41+02:00", "5TTy", "5UAA3.c.001", "vote", { sid: "v1", manche: 1 })];
  assert.equal(E.echauffements(e, "5TTy").length, 1);
  assert.deepEqual(E.poses(e, "5TTy"), { "5UAA2.c.001": 1, "5UAA2.c.002": 1, "5UAA3.c.001": 1 });
  assert.deepEqual(E.aReprendre(e, "5TTy"), { "5UAA2.c.002": true });
});

/* ---------------- tirage de l'échauffement ---------------- */
const J1 = "2026-10-08T10:30+02:00";        // jeudi 08/10 (séance précédente)
const AUJ = "2026-10-15";
function sessionPrecedente() {            // la classe a vu les sections « gauche-droite » et « fonctions de référence » de 5UAA3 le 8/10
  const out = [];
  [["5UAA3.def.003", "10:10"], ["5UAA3.exm.007", "10:20"]].forEach(([id, h]) => out.push(ev(`2026-10-08T${h}+02:00`, "5TTy", id)));
  return out;
}
const baseP = (extra) => Object.assign({ classe: cfg.classes[0], uaa: "5UAA3", banques, index: indexL, ev: [], fuseau: O.FUSEAU, jour: AUJ, graine: "g1" }, extra);
const ids3 = r => r.items.map(i => i.id || i.graine);

test("tirage : reproductible avec la même graine, varie avec une autre", () => {
  const e = sessionPrecedente();
  const a = T.tirer(baseP({ ev: e })), b = T.tirer(baseP({ ev: e }));
  assert.deepEqual(a, b);
  const autres = new Set(); for (let i = 0; i < 30; i++) autres.add(JSON.stringify(ids3(T.tirer(baseP({ ev: e, graine: "x" + i })))));
  assert.ok(autres.size > 3, "au moins quelques tirages différents");
});
test("tirage : rien de vu → prérequis seulement (3 éléments distincts), sans erreur, pas d'exercice", () => {
  const r = T.tirer(baseP());
  assert.equal(r.rienVu, true);
  assert.equal(r.items.length, 3);
  assert.ok(r.items.every(i => i.role === "prerequis" && i.kind === "qcm" && i.uaa === "5UAA3"));
  assert.equal(new Set(ids3(r)).size, 3);
  assert.deepEqual(r.notes, []);
});
test("tirage : début de chapitre (autres UAA vues, 5UAA3 jamais abordée) → pas de « précédent », espace d'UAA anciennes", () => {
  const e = [ev("2026-09-20T10:00+02:00", "5TTy", "5UAA2.rem.004"), ev("2026-09-10T10:00+02:00", "5TTy", "5UAA1.def.002")];
  for (let i = 0; i < 20; i++) {
    const r = T.tirer(baseP({ ev: e, graine: "d" + i }));
    assert.equal(r.items.length, 3);
    assert.ok(!r.items.some(x => x.slot === "precedent"));
    const esp = r.items.filter(x => x.role === "espace");
    assert.equal(esp.length, 1);
    assert.ok(["5UAA1", "5UAA2"].includes(esp[0].uaa));
    assert.ok(r.items.filter(x => x.role === "prerequis").length === 2);
  }
});
test("tirage : après plusieurs séances → précédent = matière de la dernière séance, prérequis, espace ancien", () => {
  // séance du 8/10 : section « limites-gauche-droite » (via son encadré) ; avant : 5UAA2
  const secLG = indexL.elements.find(e => e.parent === "5UAA3.limites-gauche-droite").id;
  const e = [ev("2026-09-20T10:00+02:00", "5TTy", "5UAA2.rem.004"), ev("2026-10-01T10:00+02:00", "5TTy", indexL.elements.find(x => x.parent === "5UAA3.definition").id),
             ev("2026-10-08T10:20+02:00", "5TTy", secLG)];
  const vus = new Set();
  for (let i = 0; i < 40; i++) {
    const r = T.tirer(baseP({ ev: e, graine: "s" + i }));
    assert.equal(r.items.length, 3);
    const prec = r.items.find(x => x.slot === "precedent");
    assert.equal(prec.id, "5UAA3.c.007", "seule question « precedent » portant sur limites-gauche-droite");
    assert.equal(r.jourReference, "2026-10-08");
    assert.equal(r.items.find(x => x.role === "prerequis").uaa, "5UAA3");
    assert.equal(r.items.find(x => x.role === "espace").uaa, "5UAA2");
    vus.add(r.items.find(x => x.role === "prerequis").id);
  }
  assert.ok(vus.size > 1, "les prérequis varient");
});
test("tirage : un QCM de rôle « espace » de l'UAA en cours ou d'une UAA jamais vue n'est jamais proposé", () => {
  const e = [ev("2026-09-20T10:00+02:00", "5TTy", "5UAA2.rem.004")];
  for (let i = 0; i < 40; i++) T.tirer(baseP({ ev: e, graine: "z" + i, banques: Object.assign({}, banques, { "5UAA1": banques["5UAA1"] }) })).items.forEach(x => assert.ok(x.role !== "espace" || x.uaa === "5UAA2", x.uaa));
});
test("tirage : les éléments « à reprendre » ressortent nettement plus souvent en révision espacée", () => {
  const vue = ev("2026-09-20T10:00+02:00", "5TTy", "5UAA2.rem.004");
  const ech = niv => [ev("2026-10-01T10:30+02:00", "5TTy", "echauffement", "echauffement", { sid: "s9", items: [{ id: "5UAA2.c.002", niveau: niv }, { id: "5UAA2.c.001", niveau: 2 }] }),
                      ev("2026-10-08T10:30+02:00", "5TTy", "echauffement", "echauffement", { sid: "s10", items: [{ id: "5UAA3.c.011", niveau: 2 }] })];
  const compte = e0 => { const n = {}; for (let i = 0; i < 600; i++) { const x = T.tirer(baseP({ ev: e0, graine: "r" + i })).items.find(y => y.role === "espace"); n[x.id] = (n[x.id] || 0) + 1; } return n; };
  const avec = compte([vue, ...ech(0)]), sans = compte([vue, ...ech(1)]);
  assert.ok(avec["5UAA2.c.002"] > 3 * sans["5UAA2.c.002"], JSON.stringify({ avec, sans }));
  assert.ok(avec["5UAA2.c.002"] > 3 * avec["5UAA2.c.001"], JSON.stringify(avec));
  assert.ok(Math.abs(sans["5UAA2.c.002"] - sans["5UAA2.c.001"]) < 60, "sans marque « à reprendre », ces deux-là sont à égalité : " + JSON.stringify(sans));
});
test("tirage : remplacer (↻) un élément change cet élément seulement et ne repropose pas l'ancien", () => {
  const secLG = indexL.elements.find(e => e.parent === "5UAA3.limites-gauche-droite").id;
  const e = [ev("2026-09-20T10:00+02:00", "5TTy", "5UAA2.rem.004"), ev("2026-10-08T10:20+02:00", "5TTy", secLG)];
  const r0 = T.tirer(baseP({ ev: e }));
  assert.deepEqual(r0.items.map(x => x.slot), ["precedent", "prerequis", "espace"]);
  for (const slot of ["prerequis", "espace"]) {
    const it = r0.items.find(x => x.slot === slot);
    const r1 = T.tirer(baseP({ ev: e, rempl: { [slot]: { n: 1, exclus: [T.cleExclusion(it)] } } }));
    assert.notEqual(r1.items.find(x => x.slot === slot).id, it.id, slot);
    r0.items.filter(x => x.slot !== slot).forEach(x => assert.equal(r1.items.find(y => y.slot === x.slot).id, x.id, "les autres restent"));
  }
});
test("tirage : alternance avec l'exercice d'algèbre (niveau de la classe) — absent, présent, absent", () => {
  const e0 = sessionPrecedente().concat([ev("2026-09-20T10:00+02:00", "5TTy", "5UAA2.rem.004")]);
  assert.equal(T.tirer(baseP({ ev: e0 })).avecExercice, false, "aucun échauffement précédent");
  const sansExo = ev("2026-10-08T10:05+02:00", "5TTy", "echauffement", "echauffement", { sid: "a", items: [{ id: "5UAA3.c.011", type: "qcm" }, { id: "5UAA3.c.007", type: "qcm" }, { id: "5UAA2.c.001", type: "qcm" }] });
  const r = T.tirer(baseP({ ev: e0.concat([sansExo]) }));
  assert.equal(r.avecExercice, true);
  const ex = r.items.find(x => x.kind === "exercice");
  assert.equal(ex.role, "prerequis");
  assert.match(ex.id, /\.5e$|^factoriser\.evidence$|^developper\.distrib$/, "sous-type de niveau 5e : " + ex.id);
  assert.ok(!/6e/.test(ex.id));
  assert.equal(r.items.length, 3);
  const avecExo = ev("2026-10-14T10:05+02:00", "5TTy", "echauffement", "echauffement", { sid: "b", items: [{ id: ex.id, type: "exercice", graine: ex.graine }] });
  assert.equal(T.tirer(baseP({ ev: e0.concat([sansExo, avecExo]) })).avecExercice, false);
  // la même variante n'est pas reproposée tant qu'il en reste d'autres
  const memes = [];
  for (let i = 0; i < 25; i++) memes.push(T.tirer(baseP({ ev: e0.concat([sansExo, avecExo]), exercice: true, graine: "q" + i })).items.find(x => x.kind === "exercice").graine);
  assert.ok(!memes.includes(ex.graine));
});
test("tirage : classe de 6e → seuls les sous-types 6e ; banque sans exercice → pas d'exercice", () => {
  const six = { code: "6TTi", niveau: "6e" };
  const b = { "6UAA4": J("classe-exp.json") };
  const r = T.tirer({ classe: six, uaa: "6UAA4", banques: b, index: X.creer(J("index-exp.json")), ev: [], fuseau: O.FUSEAU, jour: AUJ, graine: "x", exercice: true });
  assert.equal(r.items.find(x => x.kind === "exercice").id.endsWith("6e") || r.items.find(x => x.kind === "exercice").id === "developper.double", true);
  const r2 = T.tirer(baseP({ exercice: true, banques: { "5UAA3": Object.assign({}, banques["5UAA3"], { exercices: { lots: [] } }) } }));
  assert.equal(r2.avecExercice, false);
  assert.equal(r2.items.length, 3);
});
test("tirage : banque vide ou absente → pas d'erreur, note explicite", () => {
  const r = T.tirer(baseP({ banques: {} }));
  assert.deepEqual(r.items, []);
  assert.match(r.notes.join(" "), /insuffisante/);
  const r2 = T.tirer(baseP({ banques: { "5UAA3": { qcm: [] } }, index: X.creer(null) }));
  assert.equal(r2.items.length, 0);
});
test("tirage : versVote produit les items de typwebProf.vote.start", () => {
  const r = T.tirer(baseP({ exercice: true }));
  const v = T.versVote(r.items);
  assert.equal(v.length, 3);
  v.forEach((x, i) => assert.ok(r.items[i].kind === "exercice" ? x.graine && x.graine.includes(":") : /\.c\.\d+$/.test(x.id)));
});

/* ---------------- journal de classe et devoirs ---------------- */
function ctxJ(e, jour = "2026-10-15", format) { return { ev: e, classe: "5TTy", uaa: "5UAA3", index: indexL, jour, fuseau: O.FUSEAU, format }; }
const exo = num => indexL.elements.find(x => x.type === "exercice" && x.num === num && !x.etiquettes.includes("maison")).id;
const idsSec = (sec, type) => indexL.elements.filter(e => e.parent === `5UAA3.${sec}` && (!type || e.type === type)).map(e => e.id);

test("journal : trois lignes, début = point d'arrêt avant la séance, arrivée = dernier marqué, exercices cochés", () => {
  const debut = idsSec("definition")[0];
  const e = [ev("2026-10-08T10:20+02:00", "5TTy", debut),
    ev("2026-10-15T10:15+02:00", "5TTy", idsSec("quand-limite-a-un-sens")[0]), ev("2026-10-15T10:30+02:00", "5TTy", idsSec("limites-gauche-droite")[0]),
    ev("2026-10-15T10:40+02:00", "5TTy", exo("1.1")), ev("2026-10-15T10:41+02:00", "5TTy", exo("1.4")),
    ev("2026-10-15T10:50+02:00", "5TTy", idsSec("limites-gauche-droite")[1]),
    ev("2026-10-15T09:55+02:00", "5TTy", "echauffement", "echauffement", { sid: "z", items: [{ id: "5UAA3.c.007" }, { id: "5UAA3.c.011" }, { id: "5UAA2.c.001" }] })];
  const txt = JN.texteJournal(ctxJ(e));
  const l = txt.split("\n");
  assert.equal(l.length, 3);
  assert.equal(l[0], "Échauffement : 3 QCM");
  assert.equal(l[1], "Matière : de « Définition » à « Limites à gauche et à droite »");
  assert.equal(l[2], "Exercices : " + [exo("1.1"), exo("1.4")].map(i => indexL.parId[i].num).join(", "));
  assert.ok(!/\d{1,2}\/\d{1,2}|lundi|jeudi|vendredi/.test(txt), "ni date ni jour");
});
test("journal : échauffement avec exercice(s), pluriel, aucun échauffement, aucune marque", () => {
  const mk = items => [ev("2026-10-15T09:55+02:00", "5TTy", "echauffement", "echauffement", { sid: "z" + items.length, items })];
  const q = id => ({ id, type: "qcm" }), x = (id, g) => ({ id, type: "exercice", graine: g });
  assert.equal(JN.texteJournal(ctxJ(mk([q("a"), q("b"), x("f", "f:1")]))).split("\n")[0], "Échauffement : 2 QCM + 1 exercice");
  assert.equal(JN.texteJournal(ctxJ(mk([q("a"), x("f", "f:1"), x("g", "g:1")]))).split("\n")[0], "Échauffement : 1 QCM + 2 exercices");
  assert.equal(JN.texteJournal(ctxJ(mk([x("f", "f:1")]))).split("\n")[0], "Échauffement : 1 exercice");
  assert.equal(JN.texteJournal(ctxJ([])).split("\n")[0], "Échauffement : aucun");
  assert.equal(JN.texteJournal(ctxJ([])).split("\n")[1], "Matière : –");
  assert.equal(JN.texteJournal(ctxJ([])).split("\n")[2], "Exercices : –");
});
test("journal : première séance → début = première section du cours ; une annulation retire la marque", () => {
  const a = idsSec("rappels")[0], b = idsSec("rappels")[1];
  const e = [ev("2026-10-15T10:15+02:00", "5TTy", a), ev("2026-10-15T10:20+02:00", "5TTy", b), ev("2026-10-15T10:25+02:00", "5TTy", b, "annule")];
  assert.equal(JN.texteJournal(ctxJ(e)).split("\n")[1], "Matière : de « Rappels » à « Rappels »");
});
test("journal : une revisite d'un élément ancien (✓ contour recliqué) ne déplace pas le début", () => {
  const vieux = idsSec("definition")[0];
  const e = [ev("2026-10-08T10:20+02:00", "5TTy", vieux), ev("2026-10-15T10:10+02:00", "5TTy", vieux), ev("2026-10-15T10:30+02:00", "5TTy", idsSec("limites-gauche-droite")[0])];
  // l'élément revu aujourd'hui n'est plus « avant » : repli sur l'état d'avant la journée, qui le contenait
  assert.equal(JN.texteJournal(ctxJ(e)).split("\n")[1], "Matière : de « Définition » à « Limites à gauche et à droite »");
});
test("journal : isolation par classe et par cours", () => {
  const e = [ev("2026-10-15T10:30+02:00", "6TTi", idsSec("definition")[0]), ev("2026-10-15T10:30+02:00", "5TTy", "6UAA4.def.001")];
  assert.equal(JN.texteJournal(ctxJ(e)).split("\n")[1], "Matière : –");
});
test("devoirs : exercices « maison » dans la matière vue (chapitre 1, exercices dans les sections)", () => {
  // début : avant les Rappels ; arrivée : fin de « operations-fonctions »
  const e = [ev("2026-10-15T10:15+02:00", "5TTy", idsSec("rappels")[0]), ev("2026-10-15T10:50+02:00", "5TTy", idsSec("operations-fonctions")[0])];
  const d = JN.devoirs(ctxJ(e));
  const attendus = indexL.elements.filter(x => x.type === "exercice" && x.etiquettes.includes("maison") && x.num >= "1.1" && indexL.pos[x.id] > -1 && indexL.pos[x.id] <= indexL.pos[idsSec("operations-fonctions")[0]]);
  assert.ok(d.lignes.length > 0);
  assert.deepEqual(d.lignes.map(x => x.id), attendus.map(x => x.id));
  assert.ok(d.lignes.every(x => x.etiquettes.includes("maison")));
  assert.match(d.texte, /^Exercice 1\.\d+$/m);
  assert.ok(!/ : /.test(d.texte), "titre générique « Exercice X.Y » non répété");
});
test("devoirs : exercices regroupés en fin de chapitre → vide + proposition du chapitre (pas d'inférence silencieuse)", () => {
  const e = [ev("2026-10-08T10:15+02:00", "5TTy", idsSec("trou-dans-graphique")[0]), ev("2026-10-15T10:15+02:00", "5TTy", idsSec("definition")[0]), ev("2026-10-15T10:50+02:00", "5TTy", idsSec("limites-gauche-droite")[0])];
  const d = JN.devoirs(ctxJ(e));
  assert.equal(d.lignes.length, 0); assert.equal(d.texte, "");
  assert.equal(d.chapitre.num, "2");
  assert.equal(d.propositionChapitre.length, 5);
  assert.ok(d.propositionChapitre.every(x => x.num.startsWith("2.")));
});
test("devoirs : séance sans marque → rien ; format réglable ; {titre} descriptif conservé", () => {
  assert.equal(JN.devoirs(ctxJ([])).texte, "");
  const e = { id: "x", num: "5", titre: "Problème de modélisation" }, g = { id: "y", num: "6", titre: "Exercice 6" };
  assert.equal(JN.formaterExercice("Exercice {num}[ : {titre}]", e), "Exercice 5 : Problème de modélisation");
  assert.equal(JN.formaterExercice("Exercice {num}[ : {titre}]", g), "Exercice 6");
  assert.equal(JN.formaterExercice("Ex. {num} ({id})", g), "Ex. 6 (y)");
});

/* ---------------- façade d'état ---------------- */
test("façade : tout passe par la couche prof quand elle existe", () => {
  const appels = [];
  const P = { evenements: () => (appels.push("ev"), [1]), classe: () => "5TTy", fixerClasse: c => appels.push("fix:" + c), marquer: (id, c) => (appels.push("m:" + id), true),
              abonner: f => (appels.push("ab"), () => {}), definirClasses: l => (appels.push("dc:" + l.length), true), exporter: () => ({ ev: [] }), importer: () => ({ ok: true, ajoutes: 0, ignores: 0 }), vote: {} };
  const f = ET.creer(P, null);
  assert.equal(f.couche, true);
  f.evenements(); f.fixerClasse("6TTi"); f.marquer("x"); f.abonner(() => {}); f.definirClasses([{ code: "a" }]);
  assert.deepEqual(appels, ["ev", "fix:6TTi", "m:x", "ab", "dc:1"]);
  assert.deepEqual(f.exporter(), { ev: [] });
});
test("façade : sans couche prof → lecture seule du journal brut, aucune écriture", () => {
  const mem = { "typweb.prof.v1": JSON.stringify({ v: 2, ev: [{ id: "a" }] }) };
  const st = { getItem: k => mem[k] ?? null, setItem: (k, v) => (mem[k] = v), removeItem: k => delete mem[k] };
  const f = ET.creer(null, st);
  assert.equal(f.couche, false);
  assert.deepEqual(f.evenements(), [{ id: "a" }]);
  assert.equal(f.marquer("x"), false);
  assert.equal(f.importer("{}").ok, false);
  assert.equal(f.vote(), null);
  assert.deepEqual(JSON.parse(mem["typweb.prof.v1"]).ev, [{ id: "a" }], "journal intact");
});
