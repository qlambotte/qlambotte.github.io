"""Site de test local pour la page de pilotage : copie de la page, config de test, faux sites de cours
(Limites 5UAA3, Suites 5UAA2, Stats 5UAA1, Exp-log 6UAA4) bâtis à partir des fixtures et des vrais prof.js / vote*.js."""
import json, os, shutil, threading, functools, http.server, socketserver, tempfile

ICI = os.path.dirname(os.path.abspath(__file__))
PILOTAGE = os.path.dirname(ICI)
# prof.js / vote*.js des cours : par défaut ursulines/2026-2027/typweb/site/js (pilotage est dans ursulines/portail/)
TYPWEB_JS = os.environ.get("TYPWEB_JS", os.path.join(os.path.dirname(os.path.dirname(PILOTAGE)), "2026-2027", "typweb", "site", "js"))
FIX = os.path.join(ICI, "fixtures")


def lire(nom):
    with open(os.path.join(FIX, nom), encoding="utf-8") as f:
        return json.load(f)


def page_html(cours, uaa, rel, elements):
    corps = []
    for e in elements:
        corps.append('<div class="theo" data-id="%s" data-type="%s" data-tags="%s" style="margin:0 0 60px;padding:8px;border:1px solid #111">'
                     '<div class="theo-head">%s</div><p>Contenu de %s</p></div>' % (e["id"], e["type"], " ".join(e.get("etiquettes", [])), e["titre"], e["id"]))
    return ('<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>%s</title>'
            '<script>window.TYPWEB={uaa:"%s",index:"%sindex.json",classe:"%sprof-classe/classe.json"};window.SITE_OFFSET="%s";'
            'if(localStorage.getItem("typweb.prof")==="1"){var s=document.createElement("script");s.src="%sjs/prof.js";document.head.appendChild(s);}</script>'
            '</head><body><h1 class="title">%s</h1>%s</body></html>' % (cours, uaa, rel, rel, rel, rel, cours, "".join(corps)))


def construire_cours(racine, dossier, uaa, titre, index, classe):
    base = os.path.join(racine, dossier)
    os.makedirs(os.path.join(base, "js"), exist_ok=True)
    os.makedirs(os.path.join(base, "prof-classe"), exist_ok=True)
    for f in os.listdir(TYPWEB_JS):
        if f.startswith(("prof", "vote", "sync", "qr")):
            shutil.copy(os.path.join(TYPWEB_JS, f), os.path.join(base, "js", f))
    # ancienne configuration du site : des classes que la page de pilotage ne connaît pas (preuve d'indépendance)
    with open(os.path.join(base, "js", "prof-config.json"), "w") as f:
        json.dump({"classes": [{"code": "5GT-A", "effectif": 24}, {"code": "6TT-B", "effectif": 24}]}, f)
    with open(os.path.join(base, "index.json"), "w", encoding="utf-8") as f:
        json.dump(index, f)
    with open(os.path.join(base, "prof-classe", "classe.json"), "w", encoding="utf-8") as f:
        json.dump(classe, f)
    with open(os.path.join(base, "seed.html"), "w") as f:
        f.write("<!doctype html><title>seed</title>")
    pages = {}
    for e in index["elements"]:
        p = e["ancre"].split("#")[0]
        pages.setdefault(p, [])
        if e["type"] not in ("section", "chapitre", "qcm", "ouverte"):
            pages[p].append(e)
    for p, els in pages.items():
        chemin = os.path.join(base, p)
        os.makedirs(os.path.dirname(chemin), exist_ok=True)
        rel = "../" * p.count("/")
        with open(chemin, "w", encoding="utf-8") as f:
            f.write(page_html(titre, uaa, rel, els))
    with open(os.path.join(base, "index.html"), "w") as f:
        f.write(page_html(titre, uaa, "", []))


def config_test(base_url, interros=None, conges=None):
    with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "fixtures", "config-horaire.json"), encoding="utf-8") as f:
        c = json.load(f)                                # horaire de test (la config publiée n'en a plus)
    cours = lambda uaa, titre, d: {"uaa": uaa, "titre": titre, "url": "%s/%s/" % (base_url, d), "index": "index.json", "classe": "prof-classe/classe.json"}
    c["classes"][0]["cours"] = [cours("5UAA3", "Limites et asymptotes", "limites-cours"), cours("5UAA2", "Suites", "suites-cours"), cours("5UAA1", "Statistique à deux variables", "stats-cours")]
    c["classes"][1]["cours"] = [cours("6UAA4", "Fonctions exponentielles et logarithmes", "exp-cours")]
    c["classes"][1]["coursEnCours"] = "6UAA4"
    c["interros"] = interros if interros is not None else []
    c["conges"] = conges if conges is not None else []
    return c


class Serveur:
    def __init__(self):
        self.racine = tempfile.mkdtemp(prefix="pilotage-test-")
        self.config = None
        self._construire()
        h = functools.partial(self._Handler, directory=self.racine)
        self.httpd = socketserver.ThreadingTCPServer(("127.0.0.1", 0), h)
        self.httpd.daemon_threads = True
        self.port = self.httpd.server_address[1]
        self.url = "http://127.0.0.1:%d" % self.port
        self.thread = threading.Thread(target=self.httpd.serve_forever, daemon=True)
        self.thread.start()
        self.ecrire_config(config_test(self.url))

    class _Handler(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a):
            pass

        def end_headers(self):
            self.send_header("Cache-Control", "no-store")
            super().end_headers()

    def _construire(self):
        dest = os.path.join(self.racine, "pilotage")
        shutil.copytree(PILOTAGE, dest, ignore=shutil.ignore_patterns("tests", "README.md", "__pycache__"))
        construire_cours(self.racine, "limites-cours", "5UAA3", "Limites et asymptotes", lire("index-limites.json"), lire("classe-limites.json"))
        idx2 = {"format": 1, "cours": "Suites", "uaa": "5UAA2", "annee": "5e", "cle": "suites", "empreinte": "x", "genere": "2026-09-01", "elements": [
            {"id": "5UAA2.rem.004", "type": "remarque", "titre": "Remarque", "parent": None, "etiquettes": [], "ancre": "p.html#5UAA2.rem.004", "num": "1", "page": None}], "retires": []}
        construire_cours(self.racine, "suites-cours", "5UAA2", "Suites", idx2, lire("classe-suites.json"))
        idx1 = dict(idx2, cours="Stats", uaa="5UAA1", elements=[dict(idx2["elements"][0], id="5UAA1.def.002", type="definition", ancre="p.html#5UAA1.def.002")])
        construire_cours(self.racine, "stats-cours", "5UAA1", "Stats", idx1, lire("classe-stats.json"))
        construire_cours(self.racine, "exp-cours", "6UAA4", "Fonctions exponentielles et logarithmes", lire("index-exp.json"), lire("classe-exp.json"))

    def ecrire_config(self, cfg):
        self.config = cfg
        with open(os.path.join(self.racine, "pilotage", "config.json"), "w", encoding="utf-8") as f:
            if isinstance(cfg, str):
                f.write(cfg)
            else:
                json.dump(cfg, f, ensure_ascii=False, indent=1)

    def fermer(self):
        self.httpd.shutdown()
        self.httpd.server_close()
        shutil.rmtree(self.racine, ignore_errors=True)
