"""Tests navigateur de la page de pilotage (Chromium sans interface, Playwright).
   python3 -m unittest tests/test_pilotage.py -v     (depuis le dossier pilotage/)
   Le site de test (page + faux sites de cours + vraies prof.js / vote*.js) est monté dans un dossier temporaire."""
import json, os, sys, unittest, datetime, re
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from site_test import Serveur, config_test, lire
try:
    from playwright.sync_api import sync_playwright
except ImportError:   # pragma: no cover
    sync_playwright = None

S = None; PW = None; NAV = None


def setUpModule():
    global S, PW, NAV
    if sync_playwright is None:
        raise unittest.SkipTest("playwright absent")
    S = Serveur(); PW = sync_playwright().start(); NAV = PW.chromium.launch()


def tearDownModule():
    NAV.close(); PW.stop(); S.fermer()


def ms(iso):
    return int(datetime.datetime.fromisoformat(iso).timestamp() * 1000)


_n = [0]
def ev(iso, c, el, a="vu", **extra):
    _n[0] += 1
    return dict(id="t%04d" % _n[0], t=ms(iso), c=c, el=el, a=a, **extra)


def ids_section(sec):
    return [e["id"] for e in lire("index-limites.json")["elements"] if e["parent"] == "5UAA3." + sec]


def exo(num):
    return [e["id"] for e in lire("index-limites.json")["elements"] if e["type"] == "exercice" and e["num"] == num and "maison" not in e["etiquettes"]][0]


CONTRASTE_JS = """sels => {
  const rgba = s => { const m = s.match(/rgba?\\(([^)]+)\\)/); if (!m) return null; const v = m[1].split(/[ ,\\/]+/).filter(Boolean).map(Number); return [v[0], v[1], v[2], v.length > 3 ? v[3] : 1]; };
  const fond = e => {           // fond réel : couleurs (semi-)transparentes empilées jusqu'à un fond opaque ou un dégradé
    const pile = [];
    for (let n = e; n; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.backgroundImage && cs.backgroundImage.includes("gradient")) { pile.push(rgba(cs.backgroundImage)); break; }
      const c = rgba(cs.backgroundColor); if (c && c[3] > 0) { pile.push(c); if (c[3] >= 1) break; }
    }
    let r = [255, 255, 255];
    for (let i = pile.length - 1; i >= 0; i--) { const c = pile[i], a = c[3]; r = [0, 1, 2].map(k => c[k] * a + r[k] * (1 - a)); }
    return r;
  };
  const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
  const out = [];
  for (const s of sels) for (const e of document.querySelectorAll(s)) {
    if (!e.offsetParent && getComputedStyle(e).position !== "fixed") continue;
    const t = rgba(getComputedStyle(e).color), f = fond(e);
    const tt = [0, 1, 2].map(k => t[k] * t[3] + f[k] * (1 - t[3]));
    const a = lum(tt), b = lum(f);
    out.push([s, (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)]);
  }
  return out;
}"""


class Base(unittest.TestCase):
    def setUp(self):
        S.ecrire_config(config_test(S.url))
        self.ctx = NAV.new_context(viewport={"width": 1180, "height": 820}, locale="fr-BE", timezone_id="Europe/Brussels", permissions=["clipboard-read", "clipboard-write"], accept_downloads=True)
        self.page = self.ctx.new_page()
        self.erreurs = []
        self.page.on("pageerror", lambda e: self.erreurs.append(str(e)))

    def tearDown(self):
        self.ctx.close()
        self.assertEqual(self.erreurs, [], "erreurs JavaScript non attendues")

    def graine(self, events=(), prof=True, classe=None):
        """Écrit le journal (et le drapeau prof) dans le stockage local, avant d'ouvrir la page."""
        self.page.goto(S.url + "/limites-cours/seed.html")
        self.page.evaluate("""([ev, prof, classe]) => {
            localStorage.clear();
            if (ev.length) localStorage.setItem('typweb.prof.v1', JSON.stringify({ v: 2, ev }));
            if (prof) localStorage.setItem('typweb.prof', '1');
            if (classe) localStorage.setItem('typweb.classe', classe);
        }""", [list(events), prof, classe])

    def ouvrir(self, maintenant="2026-10-15T10:00+02:00", extra=""):
        self.page.goto(S.url + "/pilotage/?maintenant=" + maintenant.replace("+", "%2B") + extra)
        self.page.wait_for_selector("html[data-pret='1']", timeout=15000)
        return self.page

    def texte(self, sel):
        return self.page.text_content(sel).strip()     # texte brut : la mise en capitales est du style

    def journal(self):
        return self.page.evaluate("() => JSON.parse(localStorage.getItem('typweb.prof.v1') || '{\"ev\":[]}').ev")


SEANCE_PREC = lambda: [ev("2026-09-20T10:00+02:00", "5TTy", "5UAA2.rem.004"),
                       ev("2026-10-08T10:20+02:00", "5TTy", ids_section("definition")[0]),
                       ev("2026-10-08T10:40+02:00", "5TTy", ids_section("limites-gauche-droite")[0])]


class TestClasseEtHoraire(Base):
    def test_dans_le_creneau(self):
        self.graine(); self.ouvrir("2026-10-15T10:00+02:00")      # 10 min avant le début (fenêtre −15)
        self.assertEqual(self.texte("#classe-titre"), "5TTy")
        sous = self.texte("#classe-sous")
        for m in ("Local 2407", "10h10–11h50", "5UAA3", "Limites et asymptotes", "créneau détecté"):
            self.assertIn(m, sous)
        self.assertEqual(self.page.input_value("#choix-classe"), "5TTy")
        self.assertEqual(self.page.evaluate("() => window.typwebProf.classe()"), "5TTy", "la classe active de la couche prof suit")

    def test_6tti_et_son_cours(self):
        self.graine(); self.ouvrir("2026-10-12T12:30+02:00")
        self.assertEqual(self.texte("#classe-titre"), "6TTi")
        self.assertIn("Local 1213", self.texte("#classe-sous")); self.assertIn("6UAA4", self.texte("#classe-sous"))
        self.assertEqual(self.page.locator("#ech-liste .q").count(), 2, "la banque de test n'a que 2 prérequis pour 6UAA4")
        self.assertIn("insuffisante", self.texte("#ech-msg"))

    def test_borne_avant_et_apres(self):
        self.graine(); self.ouvrir("2026-10-15T09:54+02:00", )     # 16 min avant : hors créneau
        self.assertIn("Hors créneau", self.texte("#classe-sous"))
        self.graine(); self.ouvrir("2026-10-15T11:50+02:00")
        self.assertIn("créneau détecté", self.texte("#classe-sous"))
        self.graine(); self.ouvrir("2026-10-15T12:01+02:00")        # 11 min après la fin
        self.assertIn("Hors créneau", self.texte("#classe-sous"))

    def test_hors_creneau_prochaine_seance_et_choix_manuel(self):
        self.graine(); self.ouvrir("2026-10-14T11:00+02:00")
        self.assertIn("Hors créneau", self.texte("#classe-sous"))
        self.assertIn("Prochaine séance : jeudi 15/10, 10h10–11h50, local 2407 (5TTy)", self.texte("#prochaine"))
        self.assertEqual(self.texte("#classe-titre"), "5TTy")
        self.assertTrue(self.page.locator("#choix-classe").is_enabled())
        self.page.select_option("#choix-classe", "6TTi")             # autre cours → la page se recharge sur le bon cours
        self.page.wait_for_selector("html[data-pret='1']"); self.page.wait_for_function("document.querySelector('#classe-titre').textContent === '6TTi'")
        self.assertIn("classe choisie à la main", self.texte("#classe-sous"))
        self.assertIn("6UAA4", self.texte("#classe-sous"))
        self.assertEqual(self.page.evaluate("() => window.typwebProf.classe()"), "6TTi")

    def test_conge(self):
        S.ecrire_config(config_test(S.url, conges=[{"du": "2026-10-15", "au": "2026-10-16", "motif": "essai"}]))
        self.graine(); self.ouvrir("2026-10-15T10:30+02:00")
        self.assertIn("Hors créneau", self.texte("#classe-sous"))
        self.assertIn("lundi 19/10", self.texte("#prochaine"))

    def test_classes_et_effectifs_viennent_de_config_json_pas_du_site(self):
        self.graine(); self.ouvrir()
        r = self.page.evaluate("() => ({ classes: window.typwebProf.classes(), e5: window.typwebProf.effectif('5TTy'), e6: window.typwebProf.effectif('6TTi') })")
        self.assertEqual(r, {"classes": ["5TTy", "6TTi"], "e5": 20, "e6": 20})   # prof-config.json du site liste 5GT-A / 6TT-B (24)


class TestEchauffement(Base):
    def test_rien_vu_prerequis_seulement(self):
        self.graine(); self.ouvrir()
        roles = [r.strip() for r in self.page.locator("#ech-liste .q .chip").all_text_contents()]
        self.assertEqual(len(roles), 3); self.assertTrue(all("Prérequis" in r for r in roles), roles)
        self.assertIn("Rien n'a encore été vu", self.texte("#ech-sub"))

    def test_apres_plusieurs_seances_trois_roles(self):
        self.graine(SEANCE_PREC()); self.ouvrir()
        roles = [r.strip() for r in self.page.locator("#ech-liste .q .chip").all_text_contents()]
        self.assertEqual(roles, ["Séance précédente", "Prérequis", "Révision espacée"])
        self.assertIn("5UAA3.c.007", self.texte("#ech-liste"))

    def test_remplacer_retirer_refaire(self):
        self.graine(SEANCE_PREC()); self.ouvrir()
        avant = self.page.locator("#ech-liste .q .sub").all_inner_texts()
        id0 = self.page.locator("#ech-liste .q").nth(1).locator(".tete .sub").inner_text()
        self.page.locator("#ech-liste .q").nth(1).get_by_role("button", name=re.compile("Remplacer")).click()
        id1 = self.page.locator("#ech-liste .q").nth(1).locator(".tete .sub").inner_text()
        self.assertNotEqual(id0, id1)
        self.assertEqual(self.page.locator("#ech-liste .q").nth(0).locator(".tete .sub").inner_text(), "5UAA3.c.007")
        self.page.click("#ech-retirer")
        self.assertEqual(self.page.locator("#ech-liste .q").count(), 0); self.assertTrue(self.page.locator("#ech-lancer").is_disabled())
        self.page.click("#ech-retirer")
        self.assertEqual(self.page.locator("#ech-liste .q").count(), 3)
        self.page.click("#ech-refaire")
        self.assertEqual(self.page.locator("#ech-liste .q").count(), 3)

    def test_tirage_reproductible_entre_deux_chargements(self):
        self.graine(SEANCE_PREC()); self.ouvrir()
        a = self.page.locator("#ech-liste .q .tete .sub").all_text_contents()
        self.ouvrir()
        self.assertEqual(a, self.page.locator("#ech-liste .q .tete .sub").all_text_contents())

    def test_lancer_ouvre_l_ecran_de_vote_avec_un_element_d_une_autre_uaa(self):
        self.graine(SEANCE_PREC()); self.ouvrir()
        self.assertIn("5UAA2", self.texte("#ech-liste"), "la révision espacée vient de la banque de 5UAA2")
        self.page.wait_for_function("() => window.typwebProf && window.typwebProf.vote && window.typwebProf.vote.ajouterBanque")
        self.page.click("#ech-lancer")
        self.page.wait_for_function("() => window.typwebProf.vote.ouvert()", timeout=10000)
        self.assertEqual(self.texte("#ech-msg"), "")
        self.assertTrue(self.page.locator(".tv-ecran").count() == 1)
        self.page.evaluate("() => window.typwebProf.vote.fermer()")

    def test_formules_composees_sur_la_page_de_pilotage(self):
        """La page de pilotage n'a pas de MathJax : vote.js le charge (copie locale du cours, js/mathjax/)."""
        d = os.path.join(S.racine, "limites-cours", "js", "mathjax", "es5")
        os.makedirs(d, exist_ok=True)
        with open(os.path.join(d, "tex-chtml-full.js"), "w", encoding="utf-8") as f:     # MathJax factice
            f.write("window.MathJax = Object.assign(window.MathJax || {}, { factice: true, typesetPromise: function (els) {"
                    " (els || [document.body]).forEach(function (e) { e.querySelectorAll('.math').forEach(function (m) { m.setAttribute('data-mj', '1'); }); });"
                    " return Promise.resolve(); } });")
        self.graine(SEANCE_PREC()); self.ouvrir()
        self.assertFalse(self.page.evaluate("() => !!window.MathJax"))
        self.page.wait_for_function("() => window.typwebProf && window.typwebProf.vote && window.typwebProf.vote.ajouterBanque")
        self.page.click("#ech-lancer")
        self.page.wait_for_function("() => window.typwebProf.vote.ouvert()", timeout=10000)
        self.page.wait_for_function("() => window.MathJax && window.MathJax.factice && document.querySelector('.tv-ecran .math[data-mj]')", timeout=15000)
        self.page.evaluate("() => window.typwebProf.vote.fermer()")

    def test_banque_plus_recente_que_la_copie_de_la_tablette(self):
        """Copie de vote.js (moins de 12 h) sans les questions tirées : l'échauffement s'ouvre quand même."""
        self.graine(SEANCE_PREC()); self.ouvrir()
        self.page.evaluate("""async () => {
            const b = { schema: 'typweb-classe/1', uaa: '5UAA3', qcm: [], exercices: { lots: [] } };
            const c = await caches.open('typweb-prof-classe');
            await c.put(location.origin + '/limites-cours/prof-classe/classe.json', new Response(JSON.stringify(b)));
            localStorage.setItem('typweb.prof.classe.t.5UAA3', String(Date.now()));
        }""")
        self.ouvrir()
        self.page.wait_for_function("() => window.typwebProf && window.typwebProf.vote && window.typwebProf.vote.ajouterBanque")
        self.page.click("#ech-lancer")
        self.page.wait_for_function("() => window.typwebProf.vote.ouvert()", timeout=10000)
        self.assertEqual(self.page.locator(".tv-ecran.tv-message").count(), 0, "pas de message « introuvable »")
        self.page.evaluate("() => window.typwebProf.vote.fermer()")

    def test_exercice_alterne(self):
        sans = ev("2026-10-08T10:05+02:00", "5TTy", "echauffement", "echauffement", sid="a", items=[{"id": "5UAA3.c.011", "type": "qcm"}, {"id": "5UAA3.c.007", "type": "qcm"}, {"id": "5UAA2.c.001", "type": "qcm"}])
        self.graine(SEANCE_PREC() + [sans]); self.ouvrir()
        self.assertEqual(self.page.locator("#ech-liste .q .chip", has_text="Exercice").count(), 1)
        self.assertEqual(self.page.locator("#ech-liste .q").count(), 3)

    def test_classe_sans_cours_configure_pas_d_erreur(self):
        cfg = config_test(S.url); cfg["classes"][1]["cours"] = []; cfg["classes"][1]["coursEnCours"] = None; S.ecrire_config(cfg)
        self.graine(); self.ouvrir("2026-10-12T12:30+02:00")
        self.assertEqual(self.texte("#classe-titre"), "6TTi")
        self.assertIn("Aucun cours configuré", self.texte("#ech-sub"))
        self.assertTrue(self.page.locator("#ech-lancer").is_disabled())
        self.assertIn("Aucune interro", self.texte("#interros"))


class TestPoursuivre(Base):
    def test_sans_point_d_arret(self):
        self.graine(); self.ouvrir()
        self.assertIn("Aucun point d'arrêt", self.texte("#arret"))
        self.assertEqual(self.texte("#reprendre"), "Commencer le cours")

    def test_avec_point_d_arret_titre_date_et_reprise(self):
        self.graine(SEANCE_PREC()); self.ouvrir()
        self.assertIn("Limites à gauche et à droite", self.texte("#arret"))
        d = self.texte("#derniere")
        self.assertIn("jeudi 08/10", d); self.assertIn("de « Rappels » à « Limites à gauche et à droite »", d)
        href = self.page.get_attribute("#reprendre", "href")
        self.assertIn("reprise=1", href); self.assertIn("limites-gauche-droite", href)
        self.page.click("#reprendre")
        self.page.wait_for_function("() => !location.search.includes('reprise') && document.querySelector('.tw-reprise')", timeout=10000)
        self.assertIn("limites-gauche-droite", self.page.url)
        self.assertEqual(self.page.evaluate("() => window.typwebProf.classe()"), "5TTy")

    def test_mode_prof_desactive_avertit_et_s_active(self):
        self.graine(SEANCE_PREC(), prof=False); self.ouvrir()
        self.assertIn("mode prof est désactivé", self.texte("#derniere"))
        self.assertIn("désactivé", self.texte("#modeprof"))
        self.page.get_by_role("button", name="Activer le mode prof").click()
        self.assertEqual(self.page.evaluate("() => localStorage.getItem('typweb.prof')"), "1")
        self.assertIn("activé", self.texte("#modeprof"))

    def test_choisir_un_autre_endroit_ecrit_un_evenement_vu(self):
        self.graine(SEANCE_PREC()); self.ouvrir(); n0 = len(self.journal())
        self.assertTrue(self.page.locator("#apercu").is_hidden())
        self.page.click("#ailleurs"); self.assertTrue(self.page.locator("#apercu").is_visible())
        ligne = self.page.locator("#apercu-liste .bloc", has_text="Asymptote oblique").first
        ligne.get_by_role("button", name="Point d'arrêt ici").click()
        j = self.journal(); self.assertEqual(len(j), n0 + 1)
        nouveau = j[-1]; self.assertEqual((nouveau["a"], nouveau["c"]), ("vu", "5TTy"))
        idx = lire("index-limites.json")["elements"]
        derniers = [e["id"] for e in idx if e["parent"] == "5UAA3.asymptote-oblique" and e["type"] != "section"]
        self.assertEqual(nouveau["el"], derniers[-1])
        self.page.wait_for_function("document.querySelector('#arret').textContent.includes('Asymptote oblique')")
        self.assertEqual(set(nouveau), {"id", "t", "c", "el", "a"}, "aucune donnée d'élève, aucun champ superflu")


class TestJournalEtDevoirs(Base):
    def seance_du_jour(self):
        return SEANCE_PREC()[1:2] + [
            ev("2026-10-15T09:55+02:00", "5TTy", "echauffement", "echauffement", sid="z", items=[{"id": "5UAA3.c.007", "type": "qcm"}, {"id": "5UAA3.c.011", "type": "qcm"}, {"id": "f", "type": "exercice", "graine": "f:0001"}]),
            ev("2026-10-15T10:15+02:00", "5TTy", ids_section("quand-limite-a-un-sens")[0]),
            ev("2026-10-15T10:30+02:00", "5TTy", ids_section("limites-gauche-droite")[0])]

    def test_journal_trois_lignes(self):
        self.graine(self.seance_du_jour()); self.ouvrir("2026-10-15T11:00+02:00")
        l = self.page.input_value("#jdc").split("\n")
        self.assertEqual(l, ["Échauffement : 2 QCM + 1 exercice", "Matière : de « Définition » à « Limites à gauche et à droite »", "Exercices : –"])

    def test_devoirs_separes_du_journal_et_copie_separee(self):
        ex = self.seance_du_jour() + [ev("2026-10-08T09:00+02:00", "5TTy", ids_section("trou-dans-graphique")[0])]
        self.graine(ex); self.ouvrir("2026-10-15T11:00+02:00")
        self.assertEqual(self.page.input_value("#dev"), "")
        self.assertTrue(self.page.locator("#dev-chapitre").is_visible())
        self.page.click("#dev-chapitre")
        dev = self.page.input_value("#dev"); self.assertRegex(dev, r"^Exercice 2\.\d+(\nExercice 2\.\d+)*$")
        self.assertNotIn("Matière", dev)
        self.page.click("#jdc-copier")
        self.assertEqual(self.page.evaluate("() => navigator.clipboard.readText()"), self.page.input_value("#jdc"))
        self.page.click("#dev-copier")
        presse = self.page.evaluate("() => navigator.clipboard.readText()")
        self.assertEqual(presse, dev); self.assertNotIn("Échauffement", presse)

    def test_modification_manuelle_persiste_et_regenerer(self):
        self.graine(self.seance_du_jour()); self.ouvrir("2026-10-15T11:00+02:00")
        genere = self.page.input_value("#jdc")
        self.page.fill("#jdc", "Texte à moi"); self.page.fill("#dev", "Ex. 3 p. 40")
        self.ouvrir("2026-10-15T11:00+02:00")
        self.assertEqual(self.page.input_value("#jdc"), "Texte à moi"); self.assertEqual(self.page.input_value("#dev"), "Ex. 3 p. 40")
        self.page.click("#jdc-regen"); self.assertEqual(self.page.input_value("#jdc"), genere)
        self.assertEqual(self.page.input_value("#dev"), "Ex. 3 p. 40", "régénérer le journal ne touche pas aux devoirs")
        self.page.click("#dev-regen"); self.assertNotEqual(self.page.input_value("#dev"), "Ex. 3 p. 40")

    def test_le_journal_se_met_a_jour_quand_une_marque_est_ajoutee_ailleurs(self):
        self.graine(self.seance_du_jour()); self.ouvrir("2026-10-15T11:00+02:00")
        self.page.evaluate("""(e) => { const j = JSON.parse(localStorage.getItem('typweb.prof.v1')); j.ev.push(e); localStorage.setItem('typweb.prof.v1', JSON.stringify(j)); window.dispatchEvent(new StorageEvent('storage', { key: 'typweb.prof.v1' })); }""",
                           ev("2026-10-15T10:45+02:00", "5TTy", exo("1.1")))
        self.page.wait_for_function("document.querySelector('#jdc').value.includes('Exercices : 1.')")

    def test_format_des_devoirs_reglable(self):
        cfg = config_test(S.url); cfg["format"] = {"devoirs": "Ex. {num} ({id})"}; S.ecrire_config(cfg)
        ev0 = [ev("2026-10-14T10:00+02:00", "5TTy", ids_section("rappels")[0]), ev("2026-10-15T10:30+02:00", "5TTy", ids_section("operations-fonctions")[0])]
        self.graine(ev0); self.ouvrir("2026-10-15T11:00+02:00")
        self.assertRegex(self.page.input_value("#dev"), r"^Ex\. 1\.\d+ \(5UAA3\.ex\.\d+\)")


class TestInterros(Base):
    def test_liste_de_la_classe_avec_compte_a_rebours(self):
        S.ecrire_config(config_test(S.url, interros=[
            {"date": "2026-10-22", "classe": "5TTy", "uaa": "5UAA3", "type": "formatif"},
            {"date": "2026-12-10", "classe": "5TTy", "uaa": "5UAA1–3", "type": "bilan"},
            {"date": "2026-10-10", "classe": "5TTy", "uaa": "5UAA2", "type": "passée"},
            {"date": "2026-10-20", "classe": "6TTi", "uaa": "6UAA4", "type": "autre classe"}]))
        self.graine(); self.ouvrir("2026-10-15T10:00+02:00")
        t = self.texte("#interros")
        self.assertIn("jeudi 22/10 · 5UAA3 · formatif", t); self.assertIn("J−7", t); self.assertIn("J−56", t)
        self.assertNotIn("passée", t); self.assertNotIn("autre classe", t)
        self.assertIn("proche", self.page.locator("#interros .j").first.get_attribute("class"))


class TestHorsLigne(Base):
    def test_page_et_donnees_des_cours_consultes_sans_reseau(self):
        self.graine(SEANCE_PREC()); self.ouvrir()
        self.page.evaluate("() => navigator.serviceWorker.ready")
        self.page.wait_for_function("() => navigator.serviceWorker.controller || true")
        self.page.reload(); self.page.wait_for_selector("html[data-pret='1']")      # le SW contrôle la page, tout est mis de côté
        self.page.wait_for_timeout(800)
        self.assertTrue(self.page.locator("#hl").is_hidden())
        self.ctx.set_offline(True)
        self.page.goto(S.url + "/pilotage/?maintenant=2026-10-15T10:00%2B02:00")
        self.page.wait_for_selector("html[data-pret='1']", timeout=15000)
        self.assertEqual(self.texte("#classe-titre"), "5TTy")
        self.assertTrue(self.page.locator("#hl").is_visible()); self.assertEqual(self.texte("#hl"), "hors ligne")
        self.assertIn("Limites à gauche et à droite", self.texte("#arret"), "index.json du cours lu depuis la copie")
        self.assertEqual(self.page.locator("#ech-liste .q").count(), 3, "banque de classe lue depuis la copie")
        self.assertEqual(self.page.evaluate("() => !!window.typwebProf"), True, "prof.js servi par le service worker")
        self.assertEqual(self.page.locator("#erreur-config").is_hidden(), True)

    def test_copies_locales_sans_service_worker(self):
        """Sans service worker, les copies de la page elle-même (Cache API, localStorage) suffisent pour les données."""
        ctx = NAV.new_context(viewport={"width": 1180, "height": 820}, service_workers="block")
        page = ctx.new_page(); erreurs = []; page.on("pageerror", lambda e: erreurs.append(str(e)))
        page.goto(S.url + "/limites-cours/seed.html")
        page.evaluate("""(ev) => { localStorage.setItem('typweb.prof', '1'); localStorage.setItem('typweb.prof.v1', JSON.stringify({ v: 2, ev })) }""", SEANCE_PREC())
        url = S.url + "/pilotage/?maintenant=2026-10-15T10:00%2B02:00"
        page.goto(url); page.wait_for_selector("html[data-pret='1']"); page.wait_for_timeout(500)
        self.assertTrue(page.locator("#hl").is_hidden())
        for motif in ("**/index.json", "**/classe.json", "**/config.json"):
            page.route(motif, lambda r: r.abort())                  # les données ne répondent plus
        page.goto(url); page.wait_for_selector("html[data-pret='1']", timeout=15000)
        self.assertEqual(page.text_content("#classe-titre"), "5TTy")
        self.assertEqual(page.text_content("#hl").strip(), "hors ligne"); self.assertTrue(page.locator("#hl").is_visible())
        self.assertIn("Limites à gauche et à droite", page.text_content("#arret"))
        self.assertEqual(page.locator("#ech-liste .q").count(), 3)
        self.assertEqual(erreurs, []); ctx.close()

    def test_donnee_jamais_consultee_et_hors_ligne_message_lisible(self):
        ctx = NAV.new_context(service_workers="block"); page = ctx.new_page()
        page.route("**/index.json", lambda r: r.abort()); page.route("**/classe.json", lambda r: r.abort())
        page.goto(S.url + "/limites-cours/seed.html"); page.evaluate("() => localStorage.setItem('typweb.prof', '1')")
        page.goto(S.url + "/pilotage/?maintenant=2026-10-15T10:00%2B02:00"); page.wait_for_selector("html[data-pret='1']", timeout=15000)
        self.assertEqual(page.text_content("#classe-titre"), "5TTy")
        self.assertIn("Aucun élément d'échauffement", page.text_content("#ech-sub") + page.text_content("#ech-msg"))
        self.assertTrue(page.locator("#ech-lancer").is_disabled())
        ctx.close()


class TestEtatImportExport(Base):
    def test_export_puis_import_restaure_et_ne_duplique_pas(self):
        ev0 = SEANCE_PREC()
        self.graine(ev0); self.ouvrir()
        with self.page.expect_download() as d:
            self.page.click("#exporter")
        chemin = d.value.path(); data = json.load(open(chemin, encoding="utf-8"))
        self.assertEqual(data["format"], "typweb.prof.v1"); self.assertEqual(len(data["ev"]), 3)
        for e in data["ev"]:
            self.assertTrue(set(e) <= {"id", "t", "c", "el", "a", "sid", "titre", "items", "manche", "n", "total", "taux", "bonne", "graine", "niveau", "cartes"}, e)
        self.assertRegex(d.value.suggested_filename, r"^etat-pilotage-\d{4}-\d{2}-\d{2}\.json$")
        self.page.evaluate("() => localStorage.setItem('typweb.prof.v1', JSON.stringify({ v: 2, ev: [] }))")
        self.ouvrir()
        self.page.set_input_files("#fichier", chemin)
        self.page.wait_for_function("document.querySelector('#toast').textContent.includes('Import')")
        self.assertIn("3 événement(s) ajouté(s)", self.texte("#toast"))
        self.assertEqual(sorted(e["id"] for e in self.journal()), sorted(e["id"] for e in ev0))
        self.page.set_input_files("#fichier", chemin)
        self.page.wait_for_function("document.querySelector('#toast').textContent.includes('0 événement')")
        self.assertEqual(len(self.journal()), 3)
        self.assertIn("Limites à gauche et à droite", self.texte("#arret"))

    def test_import_fusionne_avec_l_existant_et_trie(self):
        self.graine([ev("2026-10-14T10:00+02:00", "5TTy", ids_section("definition")[0])]); self.ouvrir()
        ancien = {"format": "typweb.prof.v1", "v": 2, "ev": [ev("2026-10-01T10:00+02:00", "5TTy", ids_section("rappels")[0])]}
        p = os.path.join(S.racine, "ancien.json"); json.dump(ancien, open(p, "w"))
        self.page.set_input_files("#fichier", p)
        self.page.wait_for_function("document.querySelector('#toast').textContent.includes('Import')")
        j = self.journal(); self.assertEqual(len(j), 2); self.assertLess(j[0]["t"], j[1]["t"])

    def test_import_invalide_refuse_sans_toucher_au_journal(self):
        self.graine(SEANCE_PREC()); self.ouvrir()
        for contenu in ("pas du json", json.dumps({"hello": 1}), json.dumps({"format": "autre", "ev": []}), json.dumps({"format": "typweb.prof.v1", "v": 99, "ev": []})):
            p = os.path.join(S.racine, "x.json"); open(p, "w").write(contenu)
            self.page.set_input_files("#fichier", p)
            self.page.wait_for_function("document.querySelector('#toast').textContent.includes('Import impossible')")
            self.page.evaluate("() => { document.querySelector('#toast').textContent = '' }")
        self.assertEqual(len(self.journal()), 3)

    def test_import_ignore_les_evenements_mal_formes(self):
        self.graine(); self.ouvrir()
        p = os.path.join(S.racine, "m.json")
        json.dump({"format": "typweb.prof.v1", "v": 2, "ev": [{"id": "a"}, {"id": "b", "t": "x", "c": "5TTy", "el": "e", "a": "vu"}, ev("2026-10-14T10:00+02:00", "5TTy", "5UAA3.rem.001")]}, open(p, "w"))
        self.page.set_input_files("#fichier", p)
        self.page.wait_for_function("document.querySelector('#toast').textContent.includes('Import')")
        self.assertIn("1 événement(s) ajouté(s), 2 ignoré(s)", self.texte("#toast"))


class TestConfigEtAccessibilite(Base):
    def test_config_invalide_message_lisible(self):
        S.ecrire_config(json.dumps({"classes": [{"code": "5TTy", "niveau": "9e", "effectif": 0}], "creneaux": [{"jour": "lundi", "debut": "9h", "fin": "10:00", "classe": "X", "local": "1"}]}))
        self.page.goto(S.url + "/pilotage/"); self.page.wait_for_selector("#erreur-config:not([hidden])")
        t = self.texte("#erreur-config")
        for m in ("problème(s) à corriger", "classes[0].niveau", "classes[0].effectif", "creneaux[0].debut", "creneaux[0].classe"):
            self.assertIn(m, t)
        self.assertTrue(self.page.locator("#grille").is_hidden())

    def test_json_casse(self):
        S.ecrire_config("{ oups")
        self.page.goto(S.url + "/pilotage/"); self.page.wait_for_selector("#erreur-config:not([hidden])")
        self.assertIn("pas un JSON valide", self.texte("#erreur-config"))

    def test_navigation_au_clavier(self):
        self.graine(SEANCE_PREC()); self.ouvrir()
        vus = []
        for _ in range(40):
            self.page.keyboard.press("Tab")
            vus.append(self.page.evaluate("() => document.activeElement && (document.activeElement.id || document.activeElement.textContent.trim().slice(0, 30))"))
        for cible in ("ech-lancer", "reprendre", "jdc", "jdc-copier", "dev", "dev-copier"):
            self.assertIn(cible, vus, cible)
        self.page.focus("#ech-lancer"); self.assertTrue(self.page.evaluate("() => getComputedStyle(document.activeElement).outlineStyle !== 'none'"))

    def test_taille_de_texte_lisible_projetee(self):
        self.graine(SEANCE_PREC()); self.ouvrir()
        tailles = self.page.evaluate("() => ['#ech-liste .texte', '#jdc', '#arret', '.iro'].map(s => { const e = document.querySelector(s); return e ? parseFloat(getComputedStyle(e).fontSize) : 99 })")
        self.assertTrue(all(t >= 16 for t in tailles), tailles)

    def test_contraste_des_textes_jour_et_soir(self):
        """Textes, même secondaires, à 4,5:1 au moins sur leur fond réel (la page est projetée), en mode jour et en mode soir."""
        self.graine(SEANCE_PREC()); self.ouvrir()
        for theme in ("jour", "soir"):
            self.page.evaluate("t => document.documentElement.setAttribute('data-theme', t)", theme)
            mesures = self.page.evaluate(CONTRASTE_JS, ["#classe-titre", "#classe-sous .puce", "#date-jour", "#sync-etat", "#ech-liste .texte",
                "#ech-liste .chip", "#ech-liste .q > .sub", "#ech-sub", "#arret .r-titre", "#arret .r-el", "#arret .r-cours", "#derniere",
                "#jdc", "#dev", "#jdc-sub", "#interros .f", "#interros .j", ".sh", "#reprendre", "#ech-lancer", "#jdc-copier", "#ailleurs"])
            self.assertTrue(len(mesures) >= 18, mesures)
            for sel, r in mesures:
                self.assertGreaterEqual(r, 4.5, "%s : contraste %.2f en mode %s" % (sel, r, theme))

    def test_modules_a_venir_s_enregistrent(self):
        self.graine(); self.ouvrir()
        self.page.evaluate("() => window.Pilotage.enregistrerModule({ id: 'essai', rendre: (el, c) => { el.textContent = 'module ' + c.classe } })")
        self.assertEqual(self.texte("#module-essai"), "module 5TTy")


class TestPresentation(Base):
    """Charte « Ardoise et cuivre » : vues classe / réglages, apparence jour / soir, tout sur un écran, bandeau de reprise."""
    def test_vues_classe_et_reglages(self):
        self.graine(); self.ouvrir()
        self.assertTrue(self.page.is_visible("#vue-classe")); self.assertTrue(self.page.is_hidden("#vue-reglages"))
        self.page.click("#ouvrir-reglages")
        self.assertTrue(self.page.is_visible("#synchro")); self.assertTrue(self.page.is_hidden("#vue-classe"))
        self.assertTrue(self.page.url.endswith("#reglages"))
        self.page.click("#fermer-reglages")
        self.assertTrue(self.page.is_visible("#ech-lancer")); self.assertFalse(self.page.url.endswith("#reglages"))
        self.page.click("#sync-etat"); self.assertTrue(self.page.is_visible("#cle-enregistrer"), "la pastille de synchronisation ouvre les réglages")
        self.page.go_back(); self.assertTrue(self.page.is_visible("#ech-lancer"), "le bouton « précédent » ramène à la classe")
        self.page.goto(self.page.url.split("#")[0] + "#reglages"); self.page.wait_for_selector("html[data-pret='1']")
        self.assertTrue(self.page.is_visible("#synchro"), "adresse directe …/#reglages")

    def test_apparence_soir_gardee_et_automatique(self):
        self.graine(); self.ouvrir()
        self.assertEqual(self.page.get_attribute("html", "data-theme"), "jour")
        fond = lambda: self.page.evaluate("() => getComputedStyle(document.body).backgroundColor")
        clair = fond()
        self.page.click("#ouvrir-reglages"); self.page.click("#theme-soir")
        self.assertEqual(self.page.get_attribute("html", "data-theme"), "soir"); self.assertNotEqual(fond(), clair)
        self.assertEqual(self.page.get_attribute("#theme-soir", "aria-pressed"), "true")
        self.page.reload(); self.page.wait_for_selector("html[data-pret='1']")
        self.assertEqual(self.page.get_attribute("html", "data-theme"), "soir", "choix gardé sur l'appareil")
        self.page.click("#theme-auto"); self.page.emulate_media(color_scheme="dark"); self.assertNotEqual(fond(), clair)
        self.page.emulate_media(color_scheme="light"); self.assertEqual(fond(), clair)
        self.page.click("#theme-jour"); self.assertIsNone(self.page.evaluate("() => localStorage.getItem('pilotage.theme')"))

    def test_tablette_paysage_tout_sur_un_ecran_et_smartphone_sans_debordement(self):
        self.graine(SEANCE_PREC()); self.ouvrir("2026-10-15T10:40+02:00")
        self.assertLessEqual(self.page.evaluate("() => document.documentElement.scrollHeight"), 820, "pas de défilement en paysage")
        for l, h in ((820, 1180), (390, 844)):
            self.page.set_viewport_size({"width": l, "height": h})
            self.assertLessEqual(self.page.evaluate("() => document.documentElement.scrollWidth"), l, "pas de débordement horizontal à %d px" % l)
        self.page.click("#ouvrir-reglages")
        self.assertLessEqual(self.page.evaluate("() => document.documentElement.scrollWidth"), 390)

    def test_temps_de_la_seance(self):
        self.graine(); self.ouvrir("2026-10-15T10:40+02:00")
        self.assertEqual(self.texte("#heure"), "10:40"); self.assertEqual(self.texte("#reste"), "encore 70 min")
        self.assertEqual(self.texte("#date-jour"), "Jeudi 15 octobre")
        self.ouvrir("2026-10-15T10:00+02:00"); self.assertEqual(self.texte("#reste"), "début dans 10 min")
        self.ouvrir("2026-10-14T11:00+02:00"); self.assertTrue(self.page.is_hidden("#temps"), "hors créneau : pas d'anneau")

    def test_feuille_point_d_arret_se_ferme(self):
        self.graine(SEANCE_PREC()); self.ouvrir()
        self.page.click("#ailleurs"); self.assertTrue(self.page.is_visible("#apercu"))
        self.page.keyboard.press("Escape"); self.assertTrue(self.page.is_hidden("#apercu"))
        self.page.click("#ailleurs"); self.page.click("#apercu-fermer"); self.assertTrue(self.page.is_hidden("#apercu"))

    def test_bandeau_de_reprise_et_masquage(self):
        self.graine(); self.ouvrir()
        self.assertTrue(self.page.is_visible("#reprise"), "synchronisation non configurée : bandeau visible")
        self.page.click("#reprise-cle"); self.assertTrue(self.page.is_visible("#dialogue-cle"))
        self.page.click("#cle-ouvrir"); self.assertIn("Choisis d'abord", self.texte("#cle-dmsg"))
        self.page.keyboard.press("Escape"); self.assertTrue(self.page.is_hidden("#dialogue-cle"))
        self.page.click("#reprise-masquer"); self.assertTrue(self.page.is_hidden("#reprise"))
        self.page.reload(); self.page.wait_for_selector("html[data-pret='1']"); self.assertTrue(self.page.is_hidden("#reprise"))
        self.assertTrue(self.page.is_disabled("#cle-enregistrer"), "pas de clé sans synchronisation configurée")

    def test_bilan_du_dernier_echauffement(self):
        evs = SEANCE_PREC() + [ev("2026-10-08T10:05+02:00", "5TTy", "echauffement", "echauffement", sid="z",
                                  items=[{"id": "5UAA2.c.002", "type": "qcm", "niveau": 2}, {"id": "5UAA3.c.012", "type": "qcm", "niveau": 0},
                                         {"id": "5UAA3.c.007", "type": "qcm", "niveau": 2}, {"id": "f", "type": "exercice"}])]
        self.graine(evs); self.ouvrir()
        self.assertIn("La dernière fois (08/10) : 2 sur 3 bien réussies", self.texte("#ech-derniere"))
        self.assertEqual(self.page.locator("#ech-derniere .pt").count(), 3)
        self.graine(SEANCE_PREC()); self.ouvrir(); self.assertTrue(self.page.is_hidden("#ech-derniere"))

    def test_mode_prof_ne_s_affiche_que_desactive(self):
        self.graine(prof=False); self.ouvrir()
        self.assertTrue(self.page.is_visible("#modeprof"))
        self.page.click("#ouvrir-reglages"); self.page.get_by_role("button", name="Activer le mode prof").click()
        self.page.click("#fermer-reglages"); self.assertTrue(self.page.is_hidden("#modeprof"))


class TestCoucheProf(Base):
    """Ajouts à prof.js / vote.js (P1/P3), rétrocompatibles."""
    def test_api_ajoutee(self):
        self.graine(); self.ouvrir()
        r = self.page.evaluate("""() => { const P = window.typwebProf; return { v: P.version, f: ['exporter', 'importer', 'definirClasses'].map(k => typeof P[k]), vb: typeof P.vote.ajouterBanque } }""")
        self.assertEqual(r, {"v": 2, "f": ["function"] * 3, "vb": "function"})

    def test_prof_js_sans_liste_locale_garde_prof_config_json(self):
        self.graine(prof=True)
        self.page.goto(S.url + "/limites-cours/index.html"); self.page.wait_for_function("() => window.typwebProf")
        self.page.wait_for_function("() => window.typwebProf.classes().length > 0")
        self.assertEqual(self.page.evaluate("() => window.typwebProf.classes()"), ["5GT-A", "6TT-B"])

    def test_ajouter_banque_ne_rompt_pas_la_banque_courante(self):
        self.graine(); self.ouvrir()
        self.page.wait_for_function("() => window.typwebProf.vote && window.typwebProf.vote.ajouterBanque")
        ok = self.page.evaluate("""async () => { const v = window.typwebProf.vote; const b = await v.donnees(); return [b.qcm.length, v.ajouterBanque({ schema: 'typweb-classe/1', qcm: [] }), (await v.donnees()).qcm.length] }""")
        self.assertEqual(ok, [14, True, 14])
        mauvais = self.page.evaluate("() => { try { window.typwebProf.vote.ajouterBanque({ schema: 'x' }); return 'accepté' } catch (e) { return 'refusé' } }")
        self.assertEqual(mauvais, "refusé")


if __name__ == "__main__":
    unittest.main()


class TestLectureDesCartes(Base):
    """Page de scan du smartphone (P7) : cartes retenues quand elles sont stables, QR et code à taper."""

    def test_page_de_scan_cartes_stables_qr_et_code(self):
        self.page.goto(S.url + "/pilotage/scan.html")
        self.page.wait_for_function("() => window.PilotageScan && window.QrCode && window.QrVotes && window.LecteurAruco")
        # trois images de suite : retenue ; une seule image avec une autre lettre : hésitante, la retenue reste
        for _ in range(3):
            self.page.evaluate("() => PilotageScan.noter([{ id: 12, lettre: 'C' }, { id: 3, lettre: 'A' }])")
        self.page.evaluate("() => PilotageScan.noter([{ id: 12, lettre: 'D' }])")
        self.assertEqual(self.page.evaluate("() => PilotageScan.lues()"), {"3": "A", "12": "C"})
        self.page.evaluate("() => PilotageScan.noter([{ id: 99, lettre: 'A' }, { id: 99, lettre: 'A' }, { id: 99, lettre: 'A' }])")  # hors des cartes 0 à 49
        self.assertEqual(self.page.evaluate("() => Object.keys(PilotageScan.lues())"), ["3", "12"])
        # présents : saisis sur le smartphone, affichés avec les cartes lues, transmis dans le QR et le code
        self.page.fill("#presents", "21"); self.page.click("#bPlus")
        self.assertIn("2 carte(s) lue(s) sur 22 présent(s) (20 sans carte lue)", self.texte("#bilan"))
        self.page.click("#bQr")
        self.assertTrue(self.page.is_visible("#qrImg svg"))
        self.assertEqual(self.texte("#qrCode"), "P22 3A 12C")
        t = self.page.evaluate("() => PilotageScan.texteQr()")
        d = self.page.evaluate("(t) => QrVotes.decoder(t)", t)
        self.assertEqual((d["cartes"], d["presents"]), ({"3": "A", "12": "C"}, 22))
        self.page.click("#bFermer")
        self.page.reload()                                                    # gardé pour la journée
        self.page.wait_for_function("() => window.PilotageScan")
        self.assertEqual(self.page.input_value("#presents"), "22")
        for _ in range(3):
            self.page.evaluate("() => PilotageScan.noter([{ id: 12, lettre: 'C' }, { id: 3, lettre: 'A' }])")
        self.page.click("#bRaz")
        self.assertEqual(self.page.evaluate("() => PilotageScan.lues()"), {})
        self.assertTrue(self.page.is_disabled("#bQr"))


class TestNavigationDate(Base):
    """Navigation dans le temps : flèches et calendrier dans le bandeau, ?jour=, jours passés (lecture seule) et à venir."""

    def params(self):
        return self.page.evaluate("() => Object.fromEntries(new URLSearchParams(location.search))")

    def test_aujourd_hui_par_defaut_sans_pastille_ni_parametre(self):
        self.graine(SEANCE_PREC()); self.ouvrir()
        self.assertEqual(self.texte("#date-jour"), "Jeudi 15 octobre")
        self.assertEqual(self.page.locator("#retour-auj").count(), 0)
        self.assertNotIn("jour", self.params())
        self.assertTrue(self.page.is_visible("#jour-prec") and self.page.is_visible("#jour-suiv"))
        self.assertEqual(self.page.get_attribute("html", "data-statut-jour"), "aujourdhui")

    def test_fleches_url_pastille_et_temps_reel_masque(self):
        self.graine(SEANCE_PREC()); self.ouvrir("2026-10-15T10:00+02:00")
        self.assertTrue(self.page.is_visible("#temps"))
        h0 = self.page.evaluate("() => document.querySelector('.band').getBoundingClientRect().height")
        self.page.click("#jour-prec")
        self.assertEqual(self.texte("#date-jour"), "Mercredi 14 octobre")
        self.assertEqual(self.params().get("jour"), "2026-10-14")
        self.assertEqual(self.params().get("maintenant"), "2026-10-15T10:00+02:00", "?maintenant= conservé")
        self.assertEqual(self.texte("#retour-auj"), "↩ Aujourd'hui · il y a 1 j")
        self.assertTrue(self.page.is_hidden("#temps"))
        self.assertEqual(self.page.locator("#classe-sous #retour-auj").count(), 1, "pastille dans la ligne des puces")
        h1 = self.page.evaluate("() => document.querySelector('.band').getBoundingClientRect().height")
        self.assertLessEqual(h1, h0 + 4, "aucune barre en plus : le bandeau ne grandit pas")
        self.page.click("#jour-suiv"); self.page.click("#jour-suiv")
        self.assertEqual(self.texte("#retour-auj"), "↩ Aujourd'hui · dans 1 j")
        self.page.click("#retour-auj")
        self.assertEqual(self.texte("#date-jour"), "Jeudi 15 octobre")
        self.assertNotIn("jour", self.params()); self.assertEqual(self.page.locator("#retour-auj").count(), 0)
        self.assertTrue(self.page.is_visible("#temps"))

    def test_url_directe_garde_classe_et_maintenant(self):
        self.graine(SEANCE_PREC()); self.ouvrir("2026-10-15T10:00+02:00", "&jour=2026-10-08&classe=5TTy")
        self.assertEqual(self.texte("#date-jour"), "Jeudi 8 octobre")
        self.page.click("#jour-suiv")
        p = self.params()
        self.assertEqual((p["jour"], p["classe"], p["maintenant"]), ("2026-10-09", "5TTy", "2026-10-15T10:00+02:00"))

    def test_jour_invalide_ou_egal_a_aujourd_hui_ignore(self):
        self.graine(SEANCE_PREC()); self.ouvrir("2026-10-15T10:00+02:00", "&jour=2026-02-30")
        self.assertEqual(self.texte("#date-jour"), "Jeudi 15 octobre")
        self.ouvrir("2026-10-15T10:00+02:00", "&jour=2026-10-15")
        self.assertNotIn("jour", self.params())

    def test_jour_passe_lecture_seule_journal_reconstruit(self):
        self.graine(SEANCE_PREC() + [ev("2026-10-12T12:45+02:00", "6TTi", "6UAA4.x.001")])
        self.ouvrir("2026-10-15T10:00+02:00", "&jour=2026-10-08")
        self.assertEqual(self.texte("#classe-titre"), "5TTy")
        self.assertIn("passé · lecture seule", self.texte("#classe-sous"))
        self.assertIn("il y a 7 j", self.texte("#retour-auj"))
        j = self.page.input_value("#jdc")
        self.assertIn("de « Rappels » à « Limites à gauche et à droite »", j.replace("Définition", "Rappels") if "Rappels" not in j else j)
        self.assertNotIn("Matière : –", j)
        self.assertTrue(self.page.evaluate("() => document.querySelector('#jdc').readOnly && document.querySelector('#dev').readOnly"))
        self.assertIn("Reconstitué", self.texte("#jdc-sub"))
        self.assertIn("Limites à gauche et à droite", self.texte("#arret"))
        self.assertIn("fin du jeudi 08/10", self.texte("#cours-sub"))
        self.assertTrue(self.page.is_hidden("#reprendre"))
        self.assertTrue(self.page.is_disabled("#ech-lancer") and self.page.is_disabled("#ech-refaire"))
        self.page.click("#ailleurs")
        self.assertTrue(all(b.is_disabled() for b in self.page.locator("#apercu-liste .bloc button").all()), "aperçu en lecture seule")
        self.page.keyboard.press("Escape")
        self.assertEqual(self.journal().__len__(), 4, "aucune écriture dans le journal")

    def test_point_d_arret_a_la_fin_du_jour_pas_apres(self):
        self.graine(SEANCE_PREC())                                  # 08/10 : définition puis limites-gauche-droite
        self.ouvrir("2026-10-15T10:00+02:00", "&jour=2026-10-07")
        self.assertIn("Aucun point d'arrêt à cette date", self.texte("#arret"))
        self.assertNotIn("Limites à gauche et à droite", self.texte("#arret"))
        self.assertIn("Matière : –", self.page.input_value("#jdc"))

    def test_jour_a_venir_rien_de_fait(self):
        cfg = config_test(S.url); cfg["interros"] = [{"date": "2026-10-29", "classe": "5TTy", "uaa": "5UAA3", "type": "Interro"}]
        S.ecrire_config(cfg)
        self.graine(SEANCE_PREC()); self.ouvrir("2026-10-15T10:00+02:00", "&jour=2026-10-22")
        self.assertIn("à venir", self.texte("#classe-sous")); self.assertIn("dans 7 j", self.texte("#retour-auj"))
        self.assertEqual(self.page.input_value("#jdc"), ""); self.assertEqual(self.page.input_value("#dev"), "")
        self.assertIn("Séance à venir", self.texte("#jdc-sub"))
        self.assertIn("Pas encore tiré", self.texte("#ech-sub"))
        self.assertTrue(self.page.is_hidden("#temps"))
        self.assertIn("J−7", self.texte("#interros")); self.assertIn("Local 2407", self.texte("#classe-sous"))

    def test_jour_sans_cours_message_et_liens(self):
        self.graine(SEANCE_PREC()); self.ouvrir("2026-10-15T10:00+02:00", "&jour=2026-10-17")      # samedi
        z = self.texte("#sans-cours")
        self.assertIn("Pas de cours pour 5TTy", z); self.assertIn("samedi 17 octobre", z)
        self.assertIn("16/10", z); self.assertIn("22/10", z)
        self.page.click("#sans-cours button:has-text('22/10')")
        self.assertEqual(self.params()["jour"], "2026-10-22"); self.assertTrue(self.page.is_hidden("#sans-cours"))
        self.page.goto(S.url + "/pilotage/?maintenant=2026-10-15T10%3A00%2B02%3A00&jour=2026-10-17")
        self.page.wait_for_selector("html[data-pret='1']")
        self.page.click("#sans-cours button:has-text('16/10')")
        self.assertEqual(self.params()["jour"], "2026-10-16")

    def test_changement_d_heure_25_octobre(self):
        self.graine([ev("2026-10-24T23:30+02:00", "5TTy", ids_section("definition")[0]), ev("2026-10-25T23:30+01:00", "5TTy", ids_section("limites-gauche-droite")[0])])
        self.ouvrir("2026-10-28T10:00+01:00", "&jour=2026-10-24")
        for attendu in ("Dimanche 25 octobre", "Lundi 26 octobre"):
            self.page.click("#jour-suiv"); self.assertEqual(self.texte("#date-jour"), attendu)
        self.page.click("#jour-prec")                       # dimanche 25 : jour de 25 h, la marque de 23 h 30 (heure d'hiver) y reste
        self.assertIn("Limites à gauche et à droite", self.texte("#arret"))
        self.assertIn("fin du dimanche 25/10", self.texte("#cours-sub"))
        self.page.click("#jour-prec")
        self.assertIn("Définition", self.texte("#arret")); self.assertNotIn("Limites à gauche", self.texte("#arret"))

    def test_lot_de_synchro_tardif_met_a_jour_un_jour_passe(self):
        self.graine(SEANCE_PREC()); self.ouvrir("2026-10-15T10:00+02:00", "&jour=2026-10-08")
        avant = self.page.input_value("#jdc")
        tard = ev("2026-10-08T10:55+02:00", "5TTy", exo("1.1"))
        self.page.evaluate("""(e) => { const j = JSON.parse(localStorage.getItem('typweb.prof.v1')); j.ev.push(e); localStorage.setItem('typweb.prof.v1', JSON.stringify(j)); window.dispatchEvent(new StorageEvent('storage', { key: 'typweb.prof.v1' })); }""", tard)
        self.page.wait_for_function("(a) => document.querySelector('#jdc').value !== a", arg=avant)
        self.assertNotEqual(self.page.input_value("#jdc"), avant)

    def test_bouton_accueil(self):
        self.graine(SEANCE_PREC()); self.ouvrir()
        self.assertEqual(self.page.get_attribute("#accueil", "href"), "../board/index.html")
        self.assertIn("Accueil", self.texte("#accueil"))

    def test_calendrier_natif_et_clavier(self):
        self.graine(SEANCE_PREC()); self.ouvrir("2026-10-15T10:00+02:00")
        self.page.click("#date-jour")                       # showPicker() n'échoue pas la page (repli focus/click)
        self.page.fill("#jour-choix", "2026-10-12")
        self.assertEqual(self.texte("#date-jour"), "Lundi 12 octobre"); self.assertEqual(self.params()["jour"], "2026-10-12")
        self.page.locator("body").click(position={"x": 5, "y": 5})
        self.page.keyboard.press("ArrowRight"); self.assertEqual(self.texte("#date-jour"), "Mardi 13 octobre")
        self.page.keyboard.press("ArrowLeft"); self.page.keyboard.press("ArrowLeft"); self.assertEqual(self.texte("#date-jour"), "Dimanche 11 octobre")
        self.page.click("#jdc"); self.page.keyboard.press("ArrowLeft")                      # dans un champ : ignorée
        self.assertEqual(self.texte("#date-jour"), "Dimanche 11 octobre")
        self.page.evaluate("() => document.activeElement.blur()")
        self.page.evaluate("() => { location.hash = '#reglages'; }"); self.page.wait_for_selector("#vue-reglages:not([hidden])")
        self.page.keyboard.press("ArrowRight")                                               # dans les réglages : ignorée
        self.page.evaluate("() => { location.hash = ''; }")
        self.assertEqual(self.texte("#date-jour"), "Dimanche 11 octobre")

    def test_charte_contraste_jour_et_soir_des_nouveaux_elements(self):
        self.graine(SEANCE_PREC()); self.ouvrir("2026-10-15T10:00+02:00", "&jour=2026-10-08")
        for theme in ("jour", "soir"):
            self.page.evaluate("t => document.documentElement.setAttribute('data-theme', t)", theme)
            for sel, c in self.page.evaluate(CONTRASTE_JS, ["#date-jour", "#retour-auj", "#classe-sous .puce", ".date-nav .fl"]):
                self.assertGreaterEqual(c, 3.9, "%s (%s) contraste %.2f" % (sel, theme, c))

    def test_minuit_passe_la_page_suit_le_nouveau_jour(self):
        self.graine(SEANCE_PREC()); self.ouvrir("2026-10-15T10:00+02:00", "&jour=2026-10-16")
        self.assertIn("dans 1 j", self.texte("#retour-auj"))
        self.page.evaluate("() => { const A = window.PilotageEtat; }")                      # la page est sur demain ; demain devient aujourd'hui :
        self.ouvrir("2026-10-16T00:05+02:00", "&jour=2026-10-16")
        self.assertNotIn("jour", self.params()); self.assertEqual(self.page.locator("#retour-auj").count(), 0)
