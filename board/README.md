# Tableau de bord (accueil + pilotage UMONS)

Deux pages statiques, publiées à côté du pilotage : `qlambotte.github.io/board/` (accueil) et `…/board/unif.html` (pilotage UMONS).
Elles réutilisent le style, le thème (jour/soir/auto), les fonctions de dates et la détection d'horaire de `../pilotage/` : le
dossier `pilotage/` doit donc être publié aussi. Même domaine que le pilotage et les cours : le stockage local, la clé de
synchronisation et le dépôt privé sont partagés. Aucune donnée d'élève ; aucun événement ni aucune tâche dans le site public.

## Installation

`portail.toml` : ajouter

```toml
[board]
dossier = "board"
```

puis `python3 typweb/typweb.py portail ../portail --preview` (le moteur `portail.py` copie `board/` comme `pilotage/`).
`tests/` et ce README ne sont pas publiés.

## Ce que la page fait

- **Accueil** : date, puces du jour, choix du pilotage Ursulines / UMONS, « Aujourd'hui » (cours des Ursulines + événements UMONS),
  « À venir » (14 jours : interros, jalons, événements importants, échéances de tâches), raccourcis. Prochain cours des Ursulines et
  interros lus dans la copie locale de `config/pilotage.json` (celle que garde le pilotage pour le hors-ligne).
- **Pilotage UMONS** : horaire du jour (liens de cours sur chaque événement), cours, semaine, tâches synchronisées. Navigation de date : flèches ‹ ›, sélecteur de date, « Aujourd'hui », touches ← →, clic sur un jour de la semaine ; le jour choisi est dans l'adresse (`?jour=2026-10-12`, à ajouter aux favoris). Un jour passé s'affiche comme terminé ; un jour hors des périodes importées est signalé.
- **Réglages** (`unif.html#reglages`) : import des fichiers `.ics` (Outlook, HPlanning), synchronisation, jalons.

## Horaire UMONS : fichiers .ics

Outlook : *Fichier, Enregistrer le calendrier* (.ics). HPlanning : export iCal. Choisir le fichier dans Réglages ; un nouvel
import remplace l'ancien pour la même source. La page lit : heures UTC (Z), heures avec TZID (Windows ou IANA), heures sans
fuseau (lues comme heure de Bruxelles), journées entières, récurrences (DAILY, WEEKLY+BYDAY, MONTHLY, YEARLY, COUNT, UNTIL,
INTERVAL, EXDATE, occurrences déplacées par RECURRENCE-ID), événements annulés ignorés. Fenêtre : 30 jours passés, 8 mois à venir
(réimporter de temps en temps). Les liens (réunion Teams) sont pris dans URL ou dans la description.

## Dépôt privé (même dépôt et même clé que le pilotage)

```
unif/taches.json    tâches (fusion tâche par tâche, la modification la plus récente l'emporte ; suppressions gardées 90 jours)
unif/horaire.json   événements importés, par source (la source importée le plus récemment l'emporte)
unif/jalons.json    à écrire à la main : { "jalons": [ { "date": "2026-11-06", "texte": "Conseil de classe 5TTy", "ecole": "urs" } ] }
config/pilotage.json  lu (jamais écrit) : créneaux, congés, interros des Ursulines
```

La page lit le dépôt et le jeton configurés dans le pilotage (`typweb.sync.v1`, `typweb.sync.jeton`). Jeton chiffré : la page demande
la phrase secrète (réglages). Elle n'écrit que dans `unif/` et ne touche pas à `sync.js` ni au journal de classe. Le jeton
n'est jamais recopié ni affiché. Sans clé sur l'appareil, tout reste local.

## Configuration publique : `config.json`

`cours` (liens de cours UMONS), `raccourcis`, et `evenements` : `liens` (expression régulière sur le titre → cours à lier),
`importants` (mots-clés du titre), `categories` (catégories iCal). Un `url` vide s'affiche grisé (« lien à renseigner »).
Moodle et Teams n'ont pas encore d'adresse.

## Essais

`?maintenant=2026-10-22T09:30+02:00` simule l'heure ; `?jour=2026-10-12` ouvre directement un jour (pilotage UMONS). Tests : `node tests/ics.test.js` et `node tests/taches.test.js`.

## Limites de cette première version

L'accueil n'affiche pas le point d'arrêt du cours des Ursulines (il demande de charger l'index du cours : à faire ensuite).
Pas de lecture automatique des agendas : import manuel du .ics. Les jalons se saisissent dans le dépôt.
