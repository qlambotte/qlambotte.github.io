"""Captures de la page de pilotage (tablette 1180×820 paysage, 820×1180 portrait).
   python3 tests/captures_pilotage.py [DOSSIER]    (défaut : pilotage/captures/)"""
import os, sys, datetime
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from site_test import Serveur, config_test, lire
from playwright.sync_api import sync_playwright

DEST = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "captures")
os.makedirs(DEST, exist_ok=True)
ms = lambda iso: int(datetime.datetime.fromisoformat(iso).timestamp() * 1000)
idx = lire("index-limites.json")["elements"]
sec = lambda s: [e["id"] for e in idx if e["parent"] == "5UAA3." + s]
n = [0]
def ev(iso, c, el, a="vu", **x):
    n[0] += 1; return dict(id="c%04d" % n[0], t=ms(iso), c=c, el=el, a=a, **x)

PREC = [ev("2026-09-20T10:00+02:00", "5TTy", "5UAA2.rem.004"), ev("2026-10-01T10:30+02:00", "5TTy", sec("definition")[0]),
        ev("2026-10-08T10:20+02:00", "5TTy", sec("quand-limite-a-un-sens")[0]), ev("2026-10-08T10:50+02:00", "5TTy", sec("limites-gauche-droite")[0]),
        ev("2026-10-01T10:05+02:00", "5TTy", "echauffement", "echauffement", sid="a", items=[{"id": "5UAA2.c.002", "type": "qcm", "niveau": 0}, {"id": "5UAA3.c.012", "type": "qcm", "niveau": 2}])]
AUJ = PREC + [ev("2026-10-15T10:05+02:00", "5TTy", "echauffement", "echauffement", sid="b", items=[{"id": "5UAA3.c.007", "type": "qcm"}, {"id": "5UAA3.c.012", "type": "qcm"}, {"id": "f", "type": "exercice", "graine": "f:1"}]),
              ev("2026-10-15T10:20+02:00", "5TTy", sec("limites-fonctions-reference")[0]), ev("2026-10-15T10:45+02:00", "5TTy", [e["id"] for e in idx if e["type"] == "exercice" and e["num"] == "2.3"][0])]
INTERROS = [{"date": "2026-10-22", "classe": "5TTy", "uaa": "5UAA3", "type": "formatif"}, {"date": "2026-12-10", "classe": "5TTy", "uaa": "5UAA1–3", "type": "bilan"}]

S = Serveur(); S.ecrire_config(config_test(S.url, interros=INTERROS))
with sync_playwright() as p:
    nav = p.chromium.launch()
    def cap(nom, events, maintenant, taille=(1180, 820), plein=True, avant=None):
        ctx = nav.new_context(viewport={"width": taille[0], "height": taille[1]}, locale="fr-BE", timezone_id="Europe/Brussels")
        page = ctx.new_page()
        page.goto(S.url + "/limites-cours/seed.html")
        page.evaluate("([ev]) => { localStorage.clear(); localStorage.setItem('typweb.prof','1'); if (ev.length) localStorage.setItem('typweb.prof.v1', JSON.stringify({v:2, ev})) }", [events])
        page.goto(S.url + "/pilotage/?maintenant=" + maintenant.replace("+", "%2B"))
        page.wait_for_selector("html[data-pret='1']"); page.wait_for_timeout(400)
        if avant: avant(page)
        page.screenshot(path=os.path.join(DEST, nom + ".png"), full_page=plein)
        ctx.close()
    cap("1-creneau-avec-point-darret", AUJ, "2026-10-15T11:40+02:00")
    cap("2-creneau-sans-point-darret", [], "2026-10-15T10:00+02:00")
    cap("3-hors-creneau-avec-point-darret", PREC, "2026-10-14T11:00+02:00")
    cap("4-hors-creneau-sans-point-darret", [], "2026-10-14T11:00+02:00")
    cap("5-portrait-creneau-avec-point-darret", AUJ, "2026-10-15T11:40+02:00", taille=(820, 1180))
    cap("6-apercu-choisir-un-autre-endroit", PREC, "2026-10-15T10:00+02:00", avant=lambda pg: pg.click("#ailleurs"))
    cap("7-6TTi-sans-donnees", [], "2026-10-12T12:30+02:00")
    nav.close()
S.fermer(); print("captures dans", DEST)
