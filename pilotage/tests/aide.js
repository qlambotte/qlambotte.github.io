// Aide commune aux tests node : fixtures, fabrique d'événements.
const fs = require("fs"), path = require("path");
const P = path.join(__dirname, "..");
const J = f => JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", f), "utf8"));
const mod = n => require(path.join(P, "js", n + ".js"));
const O = mod("outils"), C = mod("config"), H = mod("horaire"), E = mod("ev"), X = mod("indexcours"), T = mod("tirage"), JN = mod("journal"), ET = mod("etat");
const config = C.valider(fs.readFileSync(path.join(P, "config.json"), "utf8"));
const indexL = X.creer(J("index-limites.json"));
const banques = { "5UAA3": J("classe-limites.json"), "5UAA2": J("classe-suites.json"), "5UAA1": J("classe-stats.json") };
let n = 0;
const t = iso => new Date(iso).getTime();
// ev("2026-10-08T10:30+02:00", "5TTy", "5UAA3.def.003")
const ev = (iso, c, el, a = "vu", extra = {}) => Object.assign({ id: "e" + (++n).toString().padStart(4, "0"), t: t(iso), c, el, a }, extra);
const ids = (type, parent) => J("index-limites.json").elements.filter(e => e.type === type && (!parent || e.parent === parent)).map(e => e.id);
module.exports = { P, J, mod, O, C, H, E, X, T, JN, ET, config, indexL, banques, ev, t, ids };
