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

    def test_pas_de_gris_clair_dans_les_textes(self):
        css = open(os.path.join(S.racine, "pilotage", "pilotage.css"), encoding="utf-8").read()
        for c in re.findall(r"color:\s*(#[0-9a-fA-F]{3,6})", css):
            v = c.lstrip("#"); v = "".join(ch * 2 for ch in v) if len(v) == 3 else v
            if int(v[:2], 16) >= 0xf0:      # blanc : texte sur fond noir
                continue
            self.assertLessEqual(int(v[:2], 16), 0x55, "texte trop clair pour une salle : " + c)

    def test_modules_a_venir_s_enregistrent(self):
        self.graine(); self.ouvrir()
        self.page.evaluate("() => window.Pilotage.enregistrerModule({ id: 'essai', rendre: (el, c) => { el.textContent = 'module ' + c.classe } })")
        self.assertEqual(self.texte("#module-essai"), "module 5TTy")


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
