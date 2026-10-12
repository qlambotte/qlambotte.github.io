/* Génère les fixtures de test : index.json et classe.json fictifs, fidèles aux schémas documentés
   (typweb/doc/identifiants.md, banque-classe.md). La STRUCTURE de Limites (chapitres, sections, 44 exercices
   dont 18 « maison », exercices regroupés en fin de chapitre 2 à 4) suit le vrai index.json ; les titres des
   encadrés, les énoncés et les questions sont inventés pour les tests. Aucune donnée d'élève.
   Usage : node generer.js */
const fs = require("fs");
const slug = s => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function construireIndex({ uaa, cours, annee, cle, chapitres }) {
  const els = []; const cnt = { def: 0, prop: 0, rem: 0, exm: 0, act: 0, ex: 0 };
  const enc = ["definition", "propriete", "remarque", "exemple", "activite"];
  const pre = { definition: "def", propriete: "prop", remarque: "rem", exemple: "exm", activite: "act" };
  let nEnc = 0;
  chapitres.forEach((ch, ci) => {
    const c = ci + 1, chId = `${uaa}.${ch.id}`;
    els.push({ id: chId, type: "chapitre", titre: `Chapitre ${c}. ${ch.titre}`, parent: null, etiquettes: [], ancre: `ch${c}/index.html`, num: String(c), page: null });
    let exNum = 0;
    ch.sections.forEach((s, si) => {
      const sId = `${uaa}.${s.id}`, page = `ch${c}/${si + 1}-${s.id.replace(/-\d+$/, "")}.html`;
      els.push({ id: sId, type: "section", titre: s.titre, parent: chId, etiquettes: [], ancre: page, num: `${c}.${si + 1}`, page: null });
      if (s.exercices) {                                       // section « Exercices » : exercices regroupés
        for (let k = 0; k < s.exercices.n; k++) {
          exNum++; cnt.ex++;
          els.push({ id: `${uaa}.ex.${String(cnt.ex).padStart(3, "0")}`, type: "exercice", titre: `Exercice ${c}.${exNum}`, parent: sId,
                     etiquettes: s.exercices.maison.includes(k + 1) ? ["maison"] : [], ancre: `${page}#${uaa}.ex.${String(cnt.ex).padStart(3, "0")}`, num: `${c}.${exNum}`, page: 20 + cnt.ex });
        }
        return;
      }
      for (let k = 0; k < (s.encadres ?? 2); k++) {            // encadrés
        const t = enc[nEnc++ % enc.length]; cnt[pre[t]]++;
        els.push({ id: `${uaa}.${pre[t]}.${String(cnt[pre[t]]).padStart(3, "0")}`, type: t, titre: `${t[0].toUpperCase() + t.slice(1)} ${c}.${cnt[pre[t]]} (fixture)`, parent: sId, etiquettes: [], ancre: `${page}#${uaa}.${pre[t]}.${String(cnt[pre[t]]).padStart(3, "0")}`, num: `${c}.${cnt[pre[t]]}`, page: 10 + nEnc });
      }
      (s.exos || []).forEach((maison) => {                     // exercices dans la section (chapitre 1)
        exNum++; cnt.ex++;
        els.push({ id: `${uaa}.ex.${String(cnt.ex).padStart(3, "0")}`, type: "exercice", titre: `Exercice ${c}.${exNum}`, parent: sId,
                   etiquettes: maison ? ["maison"] : [], ancre: `${page}#${uaa}.ex.${String(cnt.ex).padStart(3, "0")}`, num: `${c}.${exNum}`, page: 12 + cnt.ex });
      });
    });
  });
  els.push({ id: `${uaa}.q.fct-racines-produit`, type: "qcm", titre: "Question d'autoévaluation (fixture)", parent: `${uaa}.autoeval`, etiquettes: [], ancre: "autoeval.html", num: null, page: null });
  return { format: 1, cours, uaa, annee, cle, empreinte: "fixture0001", genere: "2026-10-12", elements: els, retires: [] };
}

const limites = construireIndex({ uaa: "5UAA3", cours: "Limites et asymptotes", annee: "5e", cle: "limites", chapitres: [
  { id: "fonctions", titre: "Fonctions", sections: [
    { id: "rappels", titre: "Rappels", exos: [false, true, true, false] },
    { id: "operations-fonctions", titre: "Opérations sur les fonctions", exos: [false, false, true] },
    { id: "reconnaitre-composee", titre: "Reconnaître une composée", exos: [false, false] },
    { id: "recherche-algebrique-domaine-fonction", titre: "Recherche algébrique du domaine d'une fonction", exos: [true, false, false] },
    { id: "asymptotes-premier-contact", titre: "Asymptotes : premier contact", exos: [false, true] } ] },
  { id: "limites-definition-lecture-graphique", titre: "Limites : définition et lecture graphique", sections: [
    { id: "decrire-graphique-sans-montrer", titre: "Décrire un graphique sans le montrer" },
    { id: "point-qui-se-deplace", titre: "Un point qui se déplace sur un graphique" },
    { id: "trou-dans-graphique", titre: "Un trou dans le graphique" },
    { id: "definition", titre: "Définition" },
    { id: "quand-limite-a-un-sens", titre: "Quand une limite a-t-elle un sens ?" },
    { id: "limites-gauche-droite", titre: "Limites à gauche et à droite" },
    { id: "limites-fonctions-reference", titre: "Les limites des fonctions de référence" },
    { id: "exercices", titre: "Exercices", exercices: { n: 12, maison: [2, 5, 7, 9, 11] } } ] },
  { id: "chercher-points-creux-asymptotes-verticales", titre: "Chercher les points creux et les asymptotes verticales", sections: [
    { id: "pourquoi-calculer", titre: "Pourquoi calculer ?" },
    { id: "fonctions-rationnelles", titre: "Les fonctions rationnelles" },
    { id: "en-un-point-du-domaine", titre: "En un point du domaine : rien à chercher" },
    { id: "en-valeur-interdite", titre: "En une valeur interdite : point creux ou asymptote verticale ?" },
    { id: "exercices-2", titre: "Exercices", exercices: { n: 8, maison: [2, 4, 6, 8] } } ] },
  { id: "chercher-asymptotes-horizontales-obliques", titre: "Chercher les asymptotes horizontales et obliques", sections: [
    { id: "polynomes-infini", titre: "Les polynômes en ±∞" },
    { id: "rationnelles-infini", titre: "Les fonctions rationnelles en ±∞ (asymptote horizontale ?)" },
    { id: "asymptote-oblique", titre: "Asymptote oblique" },
    { id: "on-ne-calcule-pas-avec-infini", titre: "On ne calcule pas avec l'infini" },
    { id: "synthese", titre: "Synthèse" },
    { id: "exercices-3", titre: "Exercices", exercices: { n: 10, maison: [1, 3, 6, 9] } } ] } ] });

const exp = construireIndex({ uaa: "6UAA4", cours: "Fonctions exponentielles et logarithmes", annee: "6e", cle: "exp-log", chapitres: [
  { id: "exponentielle", titre: "La fonction exponentielle", sections: [
    { id: "croissance-exponentielle", titre: "Croissance exponentielle : situations" },
    { id: "proprietes-puissances", titre: "Propriétés des puissances", exos: [false, true] },
    { id: "fonction-exponentielle", titre: "Fonction exponentielle : définition", exos: [true, false] } ] },
  { id: "logarithme", titre: "Le logarithme", sections: [
    { id: "logarithme-definition", titre: "Logarithme : définition", exos: [false] },
    { id: "equations-exponentielles", titre: "Équations exponentielles" },
    { id: "exercices", titre: "Exercices", exercices: { n: 6, maison: [2, 4] } } ] } ] });

// ---------- banques de classe ----------
const L = ["A", "B", "C", "D"];
function qcm(uaa, n, usage, role, sur, enonce, bonneTxt, fausses, niveau = 1) {
  const pos = n % 4, opts = []; let f = 0;
  for (let i = 0; i < 4; i++) opts.push(i === pos ? { r: bonneTxt, erreur: null, retour: null } : { r: fausses[f].r, erreur: fausses[f].e, retour: `Piège : ${fausses[f++].e}.` });
  return { id: `${uaa}.c.${String(n).padStart(3, "0")}`, usage, sur: sur ? `${uaa}.${sur}` : null, role, objectif: "A2", niveau, enonce, bonne: pos, options: opts, verif: null, tags: [] };
}
const F = (r, e) => ({ r, e });
const exo = (soustype, genre, niveau, n) => ({ soustype, genre, niveau, version: 1, variantes: Array.from({ length: n }, (_, i) => ({
  graine: `${soustype}:${String(i).padStart(4, "0")}`, enonce: `Exercice ${soustype} variante ${i} : $x^2 - ${i + 5}x + ${4 + i}$`, etapes: ["Étape 1", "Étape 2"], reponse: "$(x - 1)(x - 4)$", verifie: true })) });
const banque = (uaa, cours, annee, cle, qcms, lots) => ({ schema: "typweb-classe/1", genere: "2026-10-12", uaa, cle, cours, annee, index_empreinte: "fixture0001",
  qcm: qcms, exercices: { generateurs: 1, empreinte: "fixture", lots }, ecartees: [] });

const u3 = "5UAA3";
const lotsGen = [exo("factoriser.trinome.5e", "factoriser", "5e", 8), exo("factoriser.evidence", "factoriser", "5e", 8),
                 exo("developper.distrib", "developper", "5e", 6), exo("resoudre.deuxieme_degre.5e", "resoudre", "5e", 6),
                 exo("factoriser.trinome.6e", "factoriser", "6e", 6)];
const limitesBanque = banque(u3, "Limites et asymptotes", "5e", "limites", [
  qcm(u3, 1, "comprehension", null, "limites-gauche-droite", "Soit $f(x) = 1/(x-2)$. Que vaut la limite à gauche en 2 ?", "$-\\infty$", [F("$+\\infty$", "signe oublié"), F("$0$", "confusion avec l'infini"), F("n'existe pas", "limite confondue avec la valeur")]),
  qcm(u3, 2, "comprehension", null, "definition", "Une limite en $a$ dépend de $f(a)$ ?", "Non", [F("Oui toujours", "limite = valeur"), F("Seulement à gauche", "latéralité"), F("Seulement si $f(a)$ existe", "domaine")]),
  qcm(u3, 3, "comprehension", null, "en-valeur-interdite", "Point creux ou asymptote ?", "Cela dépend de la factorisation", [F("Toujours une asymptote", "règle c/0"), F("Toujours un point creux", "0/0"), F("Impossible à dire", "abandon")]),
  qcm(u3, 4, "comprehension", null, "asymptote-oblique", "Quand y a-t-il une asymptote oblique ?", "Degré num = degré den + 1", [F("Degré num = degré den", "horizontale"), F("Degré num < degré den", "horizontale en 0"), F("Toujours", "généralisation")], 2),
  qcm(u3, 5, "comprehension", null, "rappels", "Domaine de $\\sqrt{x}$ ?", "$[0;+\\infty[$", [F("$\\mathbb{R}$", "oubli"), F("$]0;+\\infty[$", "bord"), F("$]-\\infty;0]$", "signe")]),
  qcm(u3, 6, "comprehension", null, "trou-dans-graphique", "Un trou en $x=1$ signifie…", "$f(1)$ non défini", [F("$f(1)=0$", "confusion"), F("pas de limite", "limite"), F("asymptote", "asymptote")]),
  qcm(u3, 7, "echauffement", "precedent", "limites-gauche-droite", "$\\lim_{x\\to 2^-} \\frac{1}{x-2}$ ?", "$-\\infty$", [F("$+\\infty$", "signe"), F("$0$", "infini"), F("$2$", "valeur")]),
  qcm(u3, 8, "echauffement", "precedent", "definition", "Quel nombre la fonction approche-t-elle ?", "La limite", [F("$f(a)$", "valeur"), F("$a$", "confusion"), F("$0$", "défaut")]),
  qcm(u3, 9, "echauffement", "precedent", "en-valeur-interdite", "$\\lim_{x\\to 3}\\frac{x^2-9}{x-3}$ ?", "$6$", [F("$0$", "0/0"), F("n'existe pas", "forme"), F("$\\infty$", "règle c/0")]),
  qcm(u3, 10, "echauffement", "precedent", "fonctions-rationnelles", "Quand une fraction est-elle nulle ?", "Quand son numérateur l'est (dénominateur non nul)", [F("Toujours", "oubli"), F("Dénominateur nul", "inversion"), F("Jamais", "défaut")]),
  qcm(u3, 11, "echauffement", "prerequis", null, "Factoriser $x^2 - 9$", "$(x-3)(x+3)$", [F("$(x-3)^2$", "carré"), F("$(x+3)^2$", "carré"), F("$x(x-9)$", "mise en évidence")]),
  qcm(u3, 12, "echauffement", "prerequis", "recherche-algebrique-domaine-fonction", "Domaine de $1/(x-2)$ ?", "$\\mathbb{R}\\setminus\\{2\\}$", [F("$\\mathbb{R}$", "oubli"), F("$\\{2\\}$", "complément"), F("$]2;+\\infty[$", "bord")]),
  qcm(u3, 13, "echauffement", "prerequis", null, "Résoudre $2x+3=11$", "$x=4$", [F("$x=7$", "signe"), F("$x=14$", "produit"), F("$x=8$", "oubli")]),
  qcm(u3, 14, "echauffement", "prerequis", null, "Simplifier $\\frac{x^2-x}{x}$", "$x-1$", [F("$x$", "simplification partielle"), F("$x^2-1$", "erreur"), F("$-1$", "erreur")]),
], lotsGen);

const suitesBanque = banque("5UAA2", "Suites", "5e", "suites", [
  qcm("5UAA2", 1, "echauffement", "espace", null, "Terme général d'une suite arithmétique de raison $r$ ?", "$u_n = u_0 + nr$", [F("$u_n = u_0 r^n$", "géométrique"), F("$u_n = nr$", "oubli"), F("$u_n=u_0+r$", "oubli de n")]),
  qcm("5UAA2", 2, "echauffement", "espace", null, "Raison de 3 ; 7 ; 11 ?", "$4$", [F("$3$", "premier terme"), F("$7$", "terme"), F("$5$", "moyenne")]),
  qcm("5UAA2", 3, "echauffement", "espace", null, "Suite géométrique : $u_{n+1}/u_n$ est…", "constant", [F("nul", "erreur"), F("égal à $n$", "confusion"), F("croissant", "confusion")]),
  qcm("5UAA2", 4, "comprehension", null, null, "Question de compréhension (non utilisée)", "Oui", [F("Non", "x"), F("Peut-être", "y"), F("Jamais", "z")]),
], []);
const statsBanque = banque("5UAA1", "Statistique à deux variables", "5e", "stats2v", [
  qcm("5UAA1", 1, "echauffement", "espace", null, "Un coefficient de corrélation $r=-0{,}9$ indique…", "une forte relation décroissante", [F("pas de lien", "r négatif = absence"), F("une relation croissante", "signe"), F("une causalité", "corrélation ≠ causalité")]),
  qcm("5UAA1", 2, "echauffement", "espace", null, "$r$ vaut au plus…", "$1$ en valeur absolue", [F("$100$", "pourcentage"), F("$0$", "défaut"), F("$2$", "erreur")]),
], []);
const expBanque = banque("6UAA4", "Fonctions exponentielles et logarithmes", "6e", "exp-log", [
  qcm("6UAA4", 1, "echauffement", "precedent", "proprietes-puissances", "Simplifier $2^3\\cdot 2^4$", "$2^7$", [F("$4^7$", "base multipliée"), F("$2^{12}$", "produit des exposants"), F("$4^{12}$", "tout multiplié")]),
  qcm("6UAA4", 2, "echauffement", "precedent", "fonction-exponentielle", "$5^0$ vaut", "$1$", [F("$0$", "exposant nul"), F("$5$", "base"), F("n'existe pas", "défaut")]),
  qcm("6UAA4", 3, "echauffement", "prerequis", null, "Résoudre $2x+3=11$", "$x=4$", [F("$x=7$", "signe"), F("$x=14$", "produit"), F("$x=8$", "oubli")]),
  qcm("6UAA4", 4, "echauffement", "prerequis", null, "Propriétés des puissances à exposant entier : $a^{-n}$ =", "$1/a^n$", [F("$-a^n$", "signe"), F("$a^n$", "oubli"), F("$-n a$", "confusion")]),
  qcm("6UAA4", 5, "comprehension", null, "logarithme-definition", "$\\log_2 8$ vaut", "$3$", [F("$4$", "erreur"), F("$16$", "produit"), F("$2$", "base")]),
], [exo("factoriser.trinome.6e", "factoriser", "6e", 6), exo("developper.double", "developper", "6e", 6), exo("factoriser.trinome.5e", "factoriser", "5e", 4)]);
const deriveesBanque = banque("6UAA2", "Dérivées", "6e", "derivees", [
  qcm("6UAA2", 1, "echauffement", "espace", null, "Dérivée de $x^3$ ?", "$3x^2$", [F("$x^2$", "exposant"), F("$3x$", "oubli"), F("$x^4/4$", "primitive")]),
  qcm("6UAA2", 2, "echauffement", "espace", null, "Dérivée d'une constante ?", "$0$", [F("$1$", "erreur"), F("la constante", "oubli"), F("$x$", "erreur")]),
], []);

const sortie = { "index-limites.json": limites, "classe-limites.json": limitesBanque, "classe-suites.json": suitesBanque,
  "classe-stats.json": statsBanque, "index-exp.json": exp, "classe-exp.json": expBanque, "classe-derivees.json": deriveesBanque };
for (const [nom, obj] of Object.entries(sortie)) fs.writeFileSync(__dirname + "/" + nom, JSON.stringify(obj, null, 1) + "\n");
console.log(Object.entries(sortie).map(([n, o]) => n + " " + (o.elements ? o.elements.length + " éléments" : o.qcm.length + " QCM")).join("\n"));
const maison = limites.elements.filter(e => e.type === "exercice" && e.etiquettes.includes("maison")).length;
console.log("Limites : exercices", limites.elements.filter(e => e.type === "exercice").length, "dont maison", maison);
