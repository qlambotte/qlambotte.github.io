# Page de pilotage de classe (P4)

Page statique, ouverte sur la tablette : elle détecte la classe d'après l'horaire, lit où en est la classe
(marques ✓ de la couche prof) et propose l'échauffement, la poursuite du cours, le journal de classe, les devoirs
et les interros planifiées. Publiée sur `qlambotte.github.io/pilotage/` (même domaine que les cours : le stockage
local est partagé avec la couche prof). Aucune donnée d'élève : seulement des codes de classe et des identifiants d'éléments.

## Installation (option A : intégrée au portail)

`portail.toml` contient `[pilotage] dossier = "pilotage"`. `typweb portail` ajoute alors à `_quarto.yml` (généré) les
fichiers de la page comme ressources, copiées telles quelles à la racine du site (`/pilotage/`) ; ni lien dans le menu,
ni indexation (`noindex`). `tests/`, `README.md` et les captures ne sont pas publiés.

```bash
python3 typweb/typweb.py portail ../portail --preview   # vérifier que /pilotage/ est servi
python3 typweb/typweb.py portail ../portail --publier
```

Les cours doivent avoir été reconstruits **une fois** avec le `prof.js` et le `vote.js` à jour (fonctions ajoutées
ci-dessous) : c'est la seule reconstruction nécessaire, et elle ne dépend d'aucune classe.

## Configuration : `config/pilotage.json` (dépôt privé) et `config.json` (site public)

**Depuis la relecture d'octobre 2026**, la configuration complète (horaire, locaux, congés, interros) vit seulement dans le
dépôt privé `suivi-classes/config/pilotage.json`, lu avec le jeton (copie gardée pour le hors-ligne). Le `config.json` publié
avec la page ne contient plus que les classes et leurs cours (pas d'horaire, de local ni d'interro : un élève pourrait le lire) ;
sans jeton configuré, la page fonctionne donc sans détection d'horaire. Les tests utilisent `tests/fixtures/config-horaire.json`.

Validée au chargement (erreurs listées une par une, avec le chemin du champ).

| Clé | Contenu |
|---|---|
| `fuseau` | fuseau horaire (`Europe/Brussels`) |
| `classes[]` | `code`, `niveau` (`5e`/`6e`), `effectif`, `coursEnCours` (UAA), `cours[]` : `uaa`, `titre`, `url` (terminée par `/`), `index` (adresse relative à `url`) ; `classe` facultatif (ancienne banque publiée : la banque est lue dans le dépôt privé, `banques/<UAA>/classe.json`) |
| `creneaux[]` | `jour` (lundi…samedi), `debut`, `fin` (`HH:MM`), `classe`, `local` ; même horaire chaque semaine |
| `conges[]` | `"AAAA-MM-JJ"` ou `{ "du", "au", "motif" }` ; aucun créneau détecté ces jours-là |
| `interros[]` | `date`, `classe`, `uaa`, `type` ; rappels seulement (les passées disparaissent) |
| `format.devoirs` | modèle d'une ligne de devoirs : `{num}`, `{titre}`, `{id}` ; un groupe `[ … ]` est supprimé si un champ y est vide. Défaut : `Exercice {num}[ : {titre}]` |

Ajouter un cours à une classe : une entrée dans `classes[].cours` (elle sert aussi à la révision espacée : les banques
des UAA déjà vues par la classe sont chargées d'après cette liste) ; changer le cours en cours : `coursEnCours`.
`6TTi` n'a pas encore de cours configuré : ajouter l'entrée du cours de 6e (adresse du site, `uaa`) puis `coursEnCours`.
Les effectifs de `config.json` sont à vérifier (20, valeur provisoire). Les classes et effectifs de `config.json`
**remplacent** ceux de `prof-config.json` (la page les écrit dans le stockage local via `definirClasses`).

Source isolée : `js/config.js › sourceFichier` (lecture) et `js/etat.js` (état). Avec la synchronisation (P5, ci-dessous), la
configuration est lue d'abord dans `config/pilotage.json` du dépôt privé quand l'appareil est configuré.

## Détection de la classe

Créneau en cours = de **15 minutes avant le début à 10 minutes après la fin** (bornes comprises), heure de `fuseau`, hors congés.
Deux cours qui se suivent : un cours **en cours** l'emporte toujours ; la classe suivante n'est détectée qu'à la fin du premier
(jamais 15 min avant). La page ne se recharge jamais pendant qu'un écran de vote est ouvert.
Sinon : « Hors créneau », prochaine séance (jour, heure, local) ; la classe proposée est celle de la prochaine séance du jour si
elle commence dans l'heure, sinon la classe mémorisée.
Changer la classe ici change la classe active des onglets du cours ouverts sur la tablette : ils l'affichent (avis noir et blanc).
Le sélecteur de classe reste toujours disponible ; un choix manuel prime jusqu'à la fermeture de l'onglet.
Aide aux essais : `?maintenant=2026-10-15T10:00+02:00` simule l'heure, `?classe=5TTy` force la classe.

## Règles de tirage de l'échauffement

Trois éléments, tirés de façon reproductible (graine = classe + jour + n° de tirage ; « Tirer à nouveau » change le n°).
Banque : `classe.json` (P2), questions `usage: echauffement`, par rôle.

1. **`precedent`** : QCM de rôle `precedent` dont `sur` fait partie de la matière de la dernière séance (éléments marqués ce
   jour-là et leurs sections parentes ; à défaut, de tout ce que la classe a déjà vu dans ce cours).
2. **`prerequis`** : QCM de rôle `prerequis` de l'UAA en cours. Une fois sur deux (si le dernier échauffement n'en comptait
   pas), il est remplacé par un **exercice d'algèbre** (P2) d'un sous-type du niveau de la classe, variante jamais posée si possible.
3. **`espace`** : QCM de rôle `espace` des **autres** UAA déjà vues par la classe (au moins un ✓ dans cette UAA), banques
   chargées d'après `classes[].cours`.

Poids : `1 / (1 + nombre de fois posée)²` ; ×0,05 si posée au dernier échauffement. Un élément **« à reprendre »** (dernier
niveau noté = « peu ») ignore le malus de fois posée et pèse **×4** (×1 s'il était au dernier échauffement). Éléments
distincts. Si un rôle n'a rien à proposer (rien vu, début de chapitre), on complète avec d'autres prérequis ; si la banque
est trop pauvre, la carte est plus courte et une note l'indique. « ↻ Remplacer » change un élément sans toucher aux autres
et ne le remplace jamais par un élément déjà montré à cet emplacement. « Tout retirer » masque l'échauffement.
« Lancer » appelle `typwebProf.vote.start({ mode: "echauffement", items, titre, classe })`.

## Journal de classe et devoirs

Journal (3 lignes, sans date ni jour, modifiable, « Régénérer », « Copier le journal ») :

```
Échauffement : 3 QCM            (+ « + 1 exercice » le cas échéant ; « aucun » sans échauffement du jour)
Matière : de « … » à « … »      (sections ; début = point d'arrêt d'avant la séance, sinon première section du cours ; arrivée = dernier ✓ du jour)
Exercices : 1.1, 1.4            (numéros des exercices cochés aujourd'hui)
```

Devoirs : champ **séparé**, bouton « Copier les devoirs » propre. Exercices étiquetés `maison` situés, dans l'ordre du cours,
entre le point d'arrêt de début (exclu) et le dernier élément marqué (inclus). Dans les chapitres où les exercices sont
regroupés en fin de chapitre (cas de Limites, chapitres 2 à 4), rien n'est « dans » la matière : le champ reste vide et un
bouton propose les exercices `maison` du chapitre (à adapter). Les brouillons modifiés à la main sont gardés par classe et par
jour (`pilotage.brouillon.*`, stockage local).

## Fonctions d'état utilisées (`window.typwebProf`)

Tout passe par `js/etat.js` : `evenements`, `classe`, `fixerClasse`, `marquer` (point d'arrêt manuel : `vu` sur le dernier élément
marquable de la section choisie), `abonner`, `exporter`, `importer`, `definirClasses`, `vote.start`, `vote.ajouterBanque`.
**Ajoutées en P4, rétrocompatibles** (documentées dans `typweb/doc/couche-prof.md`) : `exporter()`, `importer()`,
`definirClasses()` dans `prof.js` ; `vote.ajouterBanque()` dans `vote.js`. Sans couche prof (hors ligne, première visite) :
le journal brut est lu en lecture seule, les boutons d'écriture sont inactifs.
« Exporter l'état » télécharge `etat-pilotage-AAAA-MM-JJ.json` (même format que « Exporter les marques ») ; « Importer » fusionne
sans doublon ni perte.

## Synchronisation avec le dépôt privé (P5)

Sauvegarde et historique de l'état dans le dépôt privé `suivi-classes`, sans serveur (API REST de GitHub, jeton « fine-grained »
limité à ce dépôt). **Rien n'est actif tant qu'aucun jeton n'est configuré sur l'appareil.** Mise en place :
`typweb/doc/mise-en-place-depot.md` ; fonctionnement détaillé : `typweb/doc/couche-prof.md` (« Synchronisation »).

- **Pastille d'état** (barre latérale, toujours visible) : « Synchro : Synchronisé », « À synchroniser (n) », « Hors ligne · n en
  attente », « Erreur : … », « Jeton verrouillé », « non configurée ». Un clic ouvre le panneau : détail (dépôt, appareil, file, lots
  connus, dernier envoi, dernière erreur et prochain essai), « Synchroniser maintenant », « Restaurer depuis le dépôt » (fusionne tous
  les lots, avec compte rendu : événements, classes, dates), « Envoyer la configuration du site vers le dépôt ».
- **Configuration de l'appareil** : jeton (champ masqué, jamais dans l'adresse), dépôt (`compte/suivi-classes`), nom de l'appareil
  (libre : « tablette »), « Tester la connexion » (dépôt accessible et privé, droit d'écriture, jeton limité à ce seul dépôt, jeton
  « classique » refusé), « Enregistrer et activer » (n'enregistre que si le test réussit, vide le champ du jeton, active le mode prof
  sur l'appareil), chiffrement facultatif du jeton par phrase secrète, « Oublier ce jeton ».
- **Quand ça part** : toutes les 5 minutes si connecté, au retour du réseau, quand la page est masquée, à la fin du créneau de la classe
  (fin de séance), à la demande. Les échecs sont repris avec un délai croissant ; l'usage en classe n'attend jamais le réseau.
- **Configuration** (`config/pilotage.json` du dépôt) : lue au démarrage ; si elle est valide elle l'emporte sur `config.json` du site
  (modifier l'horaire depuis le PC = éditer ce fichier dans le dépôt). Hors ligne, la dernière copie gardée sur la tablette sert.
- **Export / import** (« Exporter l'état », « Importer ») : conservés comme dernier recours. Un import alimente la file de synchronisation
  (sans doublon).
- **Fichiers** : `js/sync.js` (copie **identique** de `typweb/site/js/sync.js`, à recopier si celui-ci change : un test le vérifie),
  `js/synchro-ui.js` (interface). `sw.js` (version `pilotage-v2`) les garde pour le hors ligne.

## Hors ligne

`sw.js` (service worker, portée `/pilotage/`) garde la page, `config.json`, et tout fichier du même domaine déjà lu (`prof.js`,
`vote*.js`, `index.json`, `classe.json`) : réseau d'abord (4 s), sinon copie. `js/donnees.js` garde en plus une copie des
`index.json` et `classe.json` (Cache API) : si le service worker manque, les données restent lisibles. Indicateur discret
« hors ligne » ; jamais d'erreur bloquante. Première visite : ouvrir la page une fois avec une connexion.

## Lecture des cartes (P7) : `scan.html`

Page pour le **smartphone** (`<compte>.github.io/pilotage/scan.html`, lien « Lire les cartes » dans la barre) : caméra,
détection ArUco (`js/lecteur-aruco.js`), une carte est retenue quand la même lettre est lue sur trois images de suite.
« Afficher le QR » : QR des votes (`js/qr-code.js`, `js/qr-votes.js`) et le même code en clair dessous. Sur la tablette :
écran de vote → « Par carte » → « Lire le QR » (ou « Taper un code »). Rien n'est enregistré ni envoyé ; aucun nom.
`js/lecteur-aruco.js`, `js/qr-code.js`, `js/qr-votes.js` et `js/sync.js` sont des copies de typweb (identiques :
`typweb/outils/verifier_copies.py`).

## Point d'arrêt

« Reprendre ici » et le « de … à … » du journal suivent l'élément vu **le plus avancé** dans le cours (ordre de `index.json`),
pas le dernier touché. « Point d'arrêt ici » sur une section antérieure retire, après confirmation, les ✓ situés plus loin.

## Avis

Sous l'en-tête : les données indisponibles (banque, index) et une couche prof de cours trop ancienne (cours à reconstruire et
publier) sont signalées au lieu d'être ignorées.

## Modules à venir

`Pilotage.enregistrerModule({ id, rendre(conteneur, contexte) })` ajoute un module dans l'emplacement « Modules ».

## Tests

```bash
node --test tests/unit.test.js                 # logique pure (config, horaire, tirage, journal, devoirs, façade)
python3 -m unittest tests/test_synchro.py -v   # synchronisation (P5) : vraie page + faux serveur GitHub (typweb/tests/fake-github.js ; Node requis)
python3 -m unittest tests/test_pilotage.py -v  # navigateur (TYPWEB_JS=… pour un autre dossier de prof.js) (Playwright, Chromium) : vraie couche prof, hors ligne, import/export
python3 tests/captures_pilotage.py [DOSSIER]   # captures tablette 1180×820 et portrait
node tests/fixtures/generer.js                 # régénère les fixtures (index.json / classe.json fictifs)
```

Fixtures : structure fidèle au vrai `index.json` de Limites (4 chapitres, 44 exercices dont 18 `maison`, exercices regroupés
en fin de chapitre 2 à 4) ; titres d'encadrés, énoncés et questions inventés pour les tests.
