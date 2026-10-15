"""Tests navigateur de la synchronisation (P5) : vraie page de pilotage, vrais prof.js / sync.js, faux serveur GitHub local.
   python3 -m unittest tests/test_synchro.py -v      (depuis le dossier pilotage/ ; Node, Playwright et Chromium requis)
   Les appels à https://api.github.com sont interceptés par Playwright et relayés vers fake-github.js : aucun jeton réel,
   aucun accès à GitHub. FAKE_GITHUB=… pour indiquer un autre fake-github.js."""
import json, os, sys, subprocess, unittest, datetime, urllib.request, urllib.error
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from site_test import Serveur, config_test, lire, PILOTAGE
try:
    from playwright.sync_api import sync_playwright
except ImportError:   # pragma: no cover
    sync_playwright = None

FAKE = os.environ.get("FAKE_GITHUB", os.path.join(os.path.dirname(os.path.dirname(PILOTAGE)), "2026-2027", "typweb", "tests", "fake-github.js"))
DEPOT = "prof/suivi-classes"
JETON = "github_pat_FAKE0000000000000000000000_bon"
CORS = {"Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Authorization, Content-Type, If-None-Match, X-GitHub-Api-Version, Accept",
        "Access-Control-Allow-Methods": "GET, PUT, POST, OPTIONS", "Access-Control-Expose-Headers": "ETag, Retry-After, X-RateLimit-Remaining, X-RateLimit-Reset, X-OAuth-Scopes"}
S = None; PW = None; NAV = None; PROC = None; FAKE_URL = None


def setUpModule():
    global S, PW, NAV, PROC, FAKE_URL
    if sync_playwright is None:
        raise unittest.SkipTest("playwright absent")
    if not os.path.exists(FAKE):
        raise unittest.SkipTest("fake-github.js introuvable : " + FAKE)
    PROC = subprocess.Popen(["node", FAKE], stdout=subprocess.PIPE, text=True)
    FAKE_URL = json.loads(PROC.stdout.readline())["url"]
    S = Serveur(); PW = sync_playwright().start(); NAV = PW.chromium.launch()


def tearDownModule():
    NAV.close(); PW.stop(); S.fermer(); PROC.terminate(); PROC.wait()


def adm(chemin, donnees=None):
    req = urllib.request.Request(FAKE_URL + "/__admin" + chemin, data=json.dumps(donnees).encode() if donnees is not None else None,
                                 method="POST" if donnees is not None else "GET")
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())


def ms(iso):
    return int(datetime.datetime.fromisoformat(iso).timestamp() * 1000)


def ids_section(sec):
    return [e["id"] for e in lire("index-limites.json")["elements"] if e["parent"] == "5UAA3." + sec]


def relais(route, request):
    """Relaie un appel à api.github.com vers le faux serveur (avec les en-têtes CORS que GitHub renvoie)."""
    if request.method == "OPTIONS":
        return route.fulfill(status=204, headers=CORS)
    garde = ("authorization", "accept", "content-type", "if-none-match", "x-github-api-version")
    req = urllib.request.Request(FAKE_URL + request.url[len("https://api.github.com"):], data=request.post_data_buffer, method=request.method,
                                 headers={k: v for k, v in request.headers.items() if k.lower() in garde})
    try:
        r = urllib.request.urlopen(req); statut, corps, h = r.status, r.read(), dict(r.headers)
    except urllib.error.HTTPError as e:
        statut, corps, h = e.code, e.read(), dict(e.headers)
    utiles = {k: v for k, v in h.items() if k.lower() in ("etag", "content-type", "x-ratelimit-remaining", "x-ratelimit-reset", "retry-after", "x-oauth-scopes")}
    route.fulfill(status=statut, body=corps, headers=dict(utiles, **CORS))


class Base(unittest.TestCase):
    sw = "block"

    def setUp(self):
        adm("/reset", {})
        adm("/regler", {"limite": False, "hors": False, "panne": None})
        S.ecrire_config(config_test(S.url))
        self.contextes = []
        self.ctx = self.nouveau_contexte()
        self.page = self.ctx.new_page()

    def nouveau_contexte(self):
        ctx = NAV.new_context(viewport={"width": 1180, "height": 820}, locale="fr-BE", timezone_id="Europe/Brussels", accept_downloads=True, service_workers=self.sw)
        self.appels = getattr(self, "appels", [])
        ctx.route("https://api.github.com/**", lambda route, request: (self.appels.append(request.method + " " + request.url), relais(route, request)))
        self.contextes.append(ctx)
        self.journaux = getattr(self, "journaux", [])
        self.erreurs = getattr(self, "erreurs", [])
        ctx.on("page", lambda p: (p.on("console", lambda m: self.journaux.append(m.text)), p.on("pageerror", lambda e: self.erreurs.append(str(e)))))
        return ctx

    def tearDown(self):
        for c in self.contextes:
            c.close()
        self.assertEqual(self.erreurs, [], "erreurs JavaScript non attendues")
        for t in self.journaux + self.appels:
            self.assertNotIn("github_pat_", t, "jeton dans la console ou une adresse")

    def ouvrir(self, page=None, maintenant="2026-10-15T10:00+02:00"):
        p = page or self.page
        p.goto(S.url + "/pilotage/?maintenant=" + maintenant.replace("+", "%2B"))
        p.wait_for_selector("html[data-pret='1']", timeout=15000)
        return p

    def panneau(self, page=None):
        p = page or self.page
        if p.is_hidden("#synchro"):
            p.click("#sync-etat")

    def attendre_etat(self, etat, page=None, delai=15000):
        (page or self.page).wait_for_function("e => document.querySelector('#sync-etat').getAttribute('data-etat') === e", arg=etat, timeout=delai)

    def configurer(self, page=None, appareil="tablette-test", jeton=JETON, depot=DEPOT):
        p = page or self.page
        self.panneau(p)
        p.fill("input[name=jeton-sync]", jeton)
        p.fill("#synchro input[placeholder='compte/suivi-classes']", depot)
        p.fill("#synchro input[placeholder='tablette']", appareil)
        p.click("text=Enregistrer et activer")
        p.wait_for_function("() => /Enregistré|Rien n'est enregistré|invalide|introuvable/.test(document.querySelector('#synchro').textContent)", timeout=15000)

    def marquer(self, ids, page=None):
        (page or self.page).evaluate("ids => ids.forEach(i => window.typwebProf.marquer(i))", ids)

    def journal(self, page=None):
        return (page or self.page).evaluate("() => JSON.parse(localStorage.getItem('typweb.prof.v1') || '{\"ev\":[]}').ev")

    def lots(self):
        return {k: json.loads(v) for k, v in adm("/fichiers").items() if k.startswith("journal/")}


class TestSynchro(Base):
    def test_sans_configuration_rien_ne_part(self):
        p = self.ouvrir()
        self.assertEqual(p.get_attribute("#sync-etat", "data-etat"), "inactif")
        self.assertIn("non configurée", p.text_content("#sync-etat"))
        self.marquer(ids_section("definition")[:2])
        p.wait_for_timeout(500)
        self.assertEqual(self.appels, [], "aucune requête vers GitHub sans jeton")
        self.assertIsNone(p.evaluate("() => localStorage.getItem('typweb.sync.v1')"))
        self.assertIsNone(p.evaluate("() => localStorage.getItem('typweb.sync.jeton')"))
        # un événement écrit sans synchronisation ne porte pas de champ d'appareil
        self.assertTrue(all("d" not in e for e in self.journal()))

    def test_page_de_cours_sans_jeton_pas_de_synchro(self):
        p = self.page
        p.goto(S.url + "/limites-cours/seed.html")
        p.evaluate("() => { localStorage.clear(); localStorage.setItem('typweb.prof', '1'); localStorage.setItem('typweb.classe', '5TTy'); }")
        p.goto(S.url + "/limites-cours/index.html")
        p.wait_for_selector(".tw-prof")
        p.wait_for_function("() => window.typwebSync && window.typwebProf.sync === window.typwebSync")
        self.assertEqual(p.evaluate("() => window.typwebSync.statut().etat"), "inactif")
        self.assertTrue(p.is_hidden(".tw-prof-sync"))
        self.assertEqual(self.appels, [])

    def test_configuration_envoi_et_pastille(self):
        p = self.ouvrir()
        ids = ids_section("definition")[:2]
        self.marquer(ids)
        self.configurer()
        self.assertIn("Enregistré", p.text_content("#synchro"))
        self.assertEqual(p.input_value("input[name=jeton-sync]"), "", "le champ du jeton est vidé")
        self.assertNotIn("github_pat_", p.url)
        self.assertEqual(p.evaluate("() => localStorage.getItem('typweb.prof')"), "1", "couche prof activée à la fin de la configuration")
        self.attendre_etat("synchronise")
        self.assertIn("Synchronisé", p.text_content("#sync-etat"))
        lots = self.lots()
        self.assertEqual(len(lots), 1)
        nom, lot = list(lots.items())[0]
        self.assertRegex(nom, r"^journal/2026-\d\d/tablette-test_\d{4}-\d\d-\d\dT\d\d-\d\d-\d\dZ\.json$")
        self.assertEqual(sorted(e["el"] for e in lot["ev"]), sorted(ids))
        self.assertTrue(all("d" not in e for e in lot["ev"]), "événements d'avant la configuration : envoyés tels quels, jamais complétés")
        # nouveau marquage : la pastille passe à « À synchroniser (1) » puis revient à « Synchronisé »
        self.marquer(ids_section("limites-gauche-droite")[:1])
        self.assertEqual(p.get_attribute("#sync-etat", "data-etat"), "a-synchroniser")
        self.assertIn("À synchroniser (1)", p.text_content("#sync-etat"))
        self.panneau(p)
        p.click("text=Synchroniser maintenant")
        self.attendre_etat("synchronise")
        self.assertEqual(len(self.lots()), 2)
        nouveau = [l for n, l in self.lots().items() if n != nom][0]
        self.assertEqual([e["d"] for e in nouveau["ev"]], ["tablette-test"], "un geste fait après la configuration porte le nom de l'appareil")
        # le jeton n'est stocké qu'à un endroit ; ni dans l'état, ni dans le journal, ni dans l'export
        fuites = p.evaluate("t => Object.keys(localStorage).filter(k => k !== 'typweb.sync.jeton' && localStorage.getItem(k).includes(t))", JETON)
        self.assertEqual(fuites, [])
        exp = p.evaluate("() => JSON.stringify(window.typwebProf.exporter())")
        self.assertNotIn("github_pat_", exp)
        for requete in adm("/requetes"):
            self.assertNotIn("github_pat_", requete["chemin"] + requete["corps"])
        for texte in adm("/fichiers").values():
            self.assertNotIn("github_pat_", texte)

    def test_test_de_connexion_et_jeton_refuse(self):
        p = self.ouvrir()
        self.panneau(p)
        p.fill("input[name=jeton-sync]", "github_pat_FAKE0000000000000000000000_large")
        p.fill("#synchro input[placeholder='compte/suivi-classes']", DEPOT)
        p.fill("#synchro input[placeholder='tablette']", "tablette")
        p.click("text=Tester la connexion")
        p.wait_for_function("() => /Test échoué/.test(document.querySelector('#synchro').textContent)")
        self.assertIn("d'autres dépôts", p.text_content("#synchro"))
        p.click("text=Enregistrer et activer")
        p.wait_for_function("() => /Rien n'est enregistré/.test(document.querySelector('#synchro').textContent)")
        self.assertEqual(p.get_attribute("#sync-etat", "data-etat"), "inactif", "un jeton trop large n'est pas enregistré")
        p.fill("input[name=jeton-sync]", JETON)
        p.click("text=Tester la connexion")
        p.wait_for_function("() => /Connexion vérifiée/.test(document.querySelector('#synchro').textContent)")
        self.assertIn("Le dépôt est privé", p.text_content("#synchro"))

    def test_restauration_sur_appareil_vide(self):
        p = self.ouvrir()
        ids = ids_section("definition")[:2]
        self.marquer(ids); p.evaluate("() => window.typwebProf.annuler(%s)" % json.dumps(ids[0]))
        original = self.journal()
        self.configurer(); self.attendre_etat("synchronise")
        # appareil neuf : nouveau profil de navigateur, aucun journal
        ctx2 = self.nouveau_contexte(); p2 = ctx2.new_page()
        self.ouvrir(p2)
        self.assertEqual(self.journal(p2), [])
        self.configurer(p2, appareil="tablette-neuve")
        self.attendre_etat("synchronise", p2)
        # la configuration lance déjà une synchronisation ; on repart d'un journal vide pour tester le bouton lui-même
        p2.evaluate("() => localStorage.removeItem('typweb.prof.v1')")
        p2.reload(); p2.wait_for_selector("html[data-pret='1']")
        self.assertEqual(self.journal(p2), [])
        self.panneau(p2)
        p2.click("text=Restaurer depuis le dépôt")
        p2.wait_for_function("() => /événement\\(s\\) ajouté/.test(document.querySelector('#synchro').textContent)", timeout=15000)
        rapport = p2.text_content("#synchro")
        self.assertIn("3 événement(s) ajouté(s)", rapport)
        self.assertIn("5TTy", rapport)
        self.assertIn("pas de configuration dans le dépôt", rapport)
        restaure = self.journal(p2)
        cle = lambda e: (e["t"], e["id"])
        self.assertEqual(sorted(restaure, key=cle), sorted(original, key=cle), "événements identiques, champ par champ")
        etat = lambda pg: pg.evaluate("() => window.typwebProf.etat('5TTy')")
        self.assertEqual(etat(p2), etat(p))
        self.assertEqual(p2.get_attribute("#sync-etat", "data-etat"), "synchronise", "rien à renvoyer après une restauration")

    def test_hors_ligne_puis_reconnexion(self):
        p = self.ouvrir()
        self.configurer(); self.attendre_etat("synchronise")
        self.ctx.set_offline(True)
        self.marquer(ids_section("definition")[:2])
        p.wait_for_function("() => document.querySelector('#sync-etat').getAttribute('data-etat') === 'hors-ligne'")
        self.assertIn("2 en attente", p.text_content("#sync-etat"))
        self.ctx.set_offline(False)
        self.panneau(p); p.click("text=Synchroniser maintenant")
        self.attendre_etat("synchronise")
        self.assertEqual(sum(len(l["ev"]) for l in self.lots().values()), 2)

    def test_fusion_deterministe_des_marques_contradictoires_avec_la_vraie_couche_prof(self):
        el = ids_section("definition")[0]
        t = ms("2026-10-15T10:00+02:00")
        ev = lambda i, a, d: {"id": i, "t": t, "c": "5TTy", "el": el, "a": a, "d": d}
        a, z = ev("x2", "vu", "aaa"), ev("x1", "annule", "zzz")      # les identifiants vont à contre-sens des appareils
        resultats = []
        for ordre in ([a, z], [z, a]):
            ctx = self.nouveau_contexte(); pg = ctx.new_page(); self.ouvrir(pg)
            pg.evaluate("e => window.typwebProf.importer({ format: 'typweb.prof.v1', v: 2, ev: e })", ordre)
            resultats.append((pg.evaluate("() => window.typwebProf.evenements().map(e => e.id)"), pg.evaluate("() => window.typwebProf.etat('5TTy')")))
        self.assertEqual(resultats[0], resultats[1], "même ordre et même état quel que soit l'ordre d'arrivée")
        self.assertEqual(resultats[0][0], ["x2", "x1"])
        self.assertEqual(resultats[0][1], {}, "à égalité d'horodatage, l'appareil « zzz » l'emporte sur « aaa »")

    def test_etat_independant_de_l_ordre_du_tableau_vraie_couche_prof(self):
        p = self.ouvrir()
        el = ids_section("definition")[0]
        t = ms("2026-10-15T10:00+02:00")
        # journal volontairement non trié : l'événement le plus récent est au début
        p.evaluate("""([el, t]) => { localStorage.setItem('typweb.prof.v1', JSON.stringify({ v: 2, ev: [
            { id: 'b', t: t + 1000, c: '5TTy', el, a: 'vu', d: 'tablette' },
            { id: 'a', t: t, c: '5TTy', el, a: 'annule', d: 'pc' } ] })); }""", [el, t])
        self.assertEqual(list(p.evaluate("() => window.typwebProf.etat('5TTy')").keys()), [el])
        self.assertEqual(p.evaluate("() => window.PilotageEtat && Object.keys(window.Pilotage.ev.etat(window.typwebProf.evenements(), '5TTy', 'Europe/Brussels'))"), [el],
                         "même règle dans la page de pilotage (ev.js)")

    def test_geste_local_apres_un_evenement_venu_d_une_horloge_en_avance(self):
        p = self.ouvrir()
        el = ids_section("definition")[0]
        futur = p.evaluate("() => Date.now()") + 600000                  # l'autre appareil avance de 10 minutes
        p.evaluate("([el, t]) => window.typwebProf.importer({ format: 'typweb.prof.v1', v: 2, ev: [{ id: 'r1', t, c: '5TTy', el, a: 'vu', d: 'tablette' }] })", [el, futur])
        p.evaluate("el => window.typwebProf.annuler(el, '5TTy')", el)
        dernier = p.evaluate("() => window.typwebProf.evenements().slice(-1)[0]")
        self.assertEqual(dernier["a"], "annule")
        self.assertGreater(dernier["t"], futur, "le geste est daté après l'événement qu'il corrige")
        self.assertEqual(p.evaluate("() => window.typwebProf.etat('5TTy')"), {})

    def test_configuration_du_depot_prioritaire_puis_repli(self):
        p = self.ouvrir()
        self.configurer(); self.attendre_etat("synchronise")
        modifiee = config_test(S.url)
        modifiee["creneaux"][1]["local"] = "9999"                    # jeudi 5TTy : 2407 → 9999
        adm("/ecrire", {"chemin": "config/pilotage.json", "texte": json.dumps(modifiee)})
        p = self.ouvrir()
        self.assertIn("Local 9999", p.text_content("#classe-sous"))
        self.assertIn("dépôt privé (à jour)", p.text_content("#synchro"))
        # copie du dépôt invalide : écartée, le fichier du site est utilisé, avec un message
        adm("/ecrire", {"chemin": "config/pilotage.json", "texte": '{"fuseau": "Europe/Brussels", "classes": []}'})
        p = self.ouvrir()
        self.assertIn("Local 2407", p.text_content("#classe-sous"))
        self.assertIn("écartée", p.text_content("#synchro"))

    def test_jeton_expire_message_clair(self):
        p = self.ouvrir()
        self.marquer(ids_section("definition")[:1])
        self.panneau(p)
        p.fill("input[name=jeton-sync]", "github_pat_FAKE0000000000000000000000_expire")
        p.fill("#synchro input[placeholder='compte/suivi-classes']", DEPOT)
        p.fill("#synchro input[placeholder='tablette']", "tablette")
        p.click("text=Enregistrer et activer")
        p.wait_for_function("() => /Rien n'est enregistré/.test(document.querySelector('#synchro').textContent)")
        self.assertIn("Jeton invalide ou expiré", p.text_content("#synchro"))
        self.assertEqual(p.get_attribute("#sync-etat", "data-etat"), "inactif")

    def test_oublier_le_jeton(self):
        p = self.ouvrir()
        self.configurer(); self.attendre_etat("synchronise")
        self.marquer(ids_section("definition")[:1])
        p.click("text=Oublier ce jeton")
        self.assertEqual(p.get_attribute("#sync-etat", "data-etat"), "inactif")
        self.assertIsNone(p.evaluate("() => localStorage.getItem('typweb.sync.jeton')"))
        avant = len(self.appels)
        p.wait_for_timeout(300)
        self.assertEqual(len(self.appels), avant)
        self.assertEqual(len(self.journal()), 1, "les données locales sont conservées")

    def test_chiffrement_facultatif_du_jeton(self):
        p = self.ouvrir()
        self.panneau(p)
        p.fill("input[name=jeton-sync]", JETON)
        p.fill("#synchro input[placeholder='compte/suivi-classes']", DEPOT)
        p.fill("#synchro input[placeholder='tablette']", "tablette")
        p.check("#synchro input[type=checkbox]")
        pw = p.query_selector_all("#synchro input[autocomplete='new-password']")
        pw[0].fill("phrase-secrete-de-test"); pw[1].fill("phrase-secrete-de-test")
        p.click("text=Enregistrer et activer")
        p.wait_for_function("() => /Enregistré/.test(document.querySelector('#synchro').textContent)")
        self.attendre_etat("synchronise")
        self.assertNotIn(JETON, p.evaluate("() => localStorage.getItem('typweb.sync.jeton')"))
        self.ouvrir()                                               # rechargement : le jeton est verrouillé
        self.assertEqual(p.get_attribute("#sync-etat", "data-etat"), "verrouille")
        self.marquer(ids_section("definition")[:1])
        self.panneau(p)
        champ = p.query_selector("#synchro .bloc-sync:not([hidden]) input[type=password]")
        champ.fill("phrase-secrete-de-test")
        p.click("text=Déverrouiller")
        self.attendre_etat("synchronise")


class TestPremierLancementHorsLigne(Base):
    sw = "allow"

    def test_premier_lancement_sans_reseau_avec_file_et_copie_du_depot(self):
        p = self.ouvrir()
        modifiee = config_test(S.url)
        modifiee["creneaux"][1]["local"] = "9999"
        adm("/ecrire", {"chemin": "config/pilotage.json", "texte": json.dumps(modifiee)})
        self.configurer(); self.attendre_etat("synchronise")
        p.reload(); p.wait_for_selector("html[data-pret='1']")                       # le service worker prend la main, la copie du dépôt est gardée
        p.evaluate("() => navigator.serviceWorker.ready")
        p.reload(); p.wait_for_selector("html[data-pret='1']"); p.wait_for_timeout(800)
        self.assertIn("Local 9999", p.text_content("#classe-sous"))
        # « premier lancement de la journée » sans réseau : ni GitHub, ni le site ne répondent
        self.ctx.set_offline(True)
        p.goto(S.url + "/pilotage/?maintenant=2026-10-15T10:00%2B02:00")
        p.wait_for_selector("html[data-pret='1']", timeout=15000)
        self.assertIn("Local 9999", p.text_content("#classe-sous"), "configuration du dépôt lue depuis la copie locale")
        self.assertIn("copie gardée", p.text_content("#synchro"))
        self.marquer(ids_section("definition")[:2])
        self.assertEqual(p.get_attribute("#sync-etat", "data-etat"), "hors-ligne")
        self.assertIn("2 en attente", p.text_content("#sync-etat"))
        self.assertEqual(len(self.journal()), 2, "le marquage s'écrit localement")
        self.ctx.set_offline(False)
        self.panneau(p); p.click("text=Synchroniser maintenant")
        self.attendre_etat("synchronise")
        self.assertEqual(sum(len(l["ev"]) for l in self.lots().values()), 2)


if __name__ == "__main__":
    unittest.main()
