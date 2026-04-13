# CityTaste
🇬🇧 English version: [README.md](README.md)

<p align="center">
  <strong>Une plateforme de recommandation alimentée par l’IA pour découvrir des restaurants et des hébergements à Ottawa.</strong>
</p>

<p align="center">
  CityTaste combine la préparation des données, la logique de recommandation, une interface web et un assistant IA afin d’aider les utilisateurs à trouver des lieux pertinents plus rapidement et avec davantage de confiance.
</p>

<p align="center">
  🇬🇧 English version: <a href="README.md">README.md</a>
</p>

---

## Table des matières
- [Vue d’ensemble du projet](#vue-densemble-du-projet)
- [Problématique](#problématique)
- [Solution](#solution)
- [Fonctionnalités principales](#fonctionnalités-principales)
- [Architecture du projet](#architecture-du-projet)
- [Structure du dépôt](#structure-du-dépôt)
- [Technologies utilisées](#technologies-utilisées)
- [Données et expérimentation](#données-et-expérimentation)
- [Installation](#installation)
- [Exécution du projet](#exécution-du-projet)
- [Module d’assistant IA](#module-dassistant-ia)
- [Documentation](#documentation)
- [Cas d’usage](#cas-dusage)
- [Améliorations futures](#améliorations-futures)
- [Auteur](#auteur)

---

## Vue d’ensemble du projet

**CityTaste** est un projet de fin d’études conçu pour améliorer la manière dont les utilisateurs découvrent des restaurants et des hébergements à **Ottawa**.

Au lieu de consulter plusieurs sites web et de comparer manuellement des informations dispersées, les utilisateurs peuvent explorer des lieux pertinents à partir d’une seule interface, alimentée par des filtres, un classement intelligent et une assistance conversationnelle.

Le projet réunit :
- une **application web front-end** pour l’exploration et les recommandations,
- un **flux de travail Python** pour la recommandation,
- un **assistant IA** pour l’accompagnement des utilisateurs,
- ainsi qu’un ensemble structuré de **données, notebooks et documents de projet**.

---

## Problématique

Dans une ville comme Ottawa, les gens passent souvent beaucoup de temps à comparer des restaurants, des hôtels et d’autres lieux sur différentes plateformes.

Les difficultés fréquentes incluent :
- trop d’options avec des informations incomplètes ou incohérentes,
- la difficulté de filtrer selon la cuisine, la distance ou les besoins alimentaires,
- des résultats génériques qui manquent de personnalisation,
- et l’absence d’explications claires sur les raisons pour lesquelles un lieu est recommandé.

Cette problématique touche plusieurs profils d’utilisateurs, notamment les étudiants, les résidents, les nouveaux arrivants, les familles et les touristes.

---

## Solution

CityTaste a été conçu pour centraliser cette expérience de recherche et rendre les recommandations plus simples à comprendre.

La plateforme permet aux utilisateurs de :
- rechercher des lieux à Ottawa,
- filtrer les résultats selon des préférences pertinentes,
- obtenir des recommandations classées,
- et interagir avec un assistant qui explique les fonctionnalités et guide l’utilisation.

L’objectif global est de démontrer un projet d’IA de bout en bout qui relie **la préparation des données**, **la logique de recommandation**, **la conception web** et **l’assistance conversationnelle** dans une solution cohérente.

---

## Fonctionnalités principales

- Découverte de restaurants et d’hébergements à Ottawa
- Recherche et filtrage par type de lieu, cuisine et autres critères
- Résultats de recommandation classés
- Assistant IA pour le soutien et l’orientation des utilisateurs
- Flux de préparation et d’enrichissement des données
- Notebooks d’expérimentation pour l’analyse et le développement
- Documentation académique et technique du projet

---

## Architecture du projet

CityTaste est organisé en quatre grandes parties.

### 1) Interface front-end
Il s’agit de la couche principale visible par l’utilisateur.

Fichiers principaux :
- `index.html`
- `app.js`
- `styles.css`
- `assets/`

Responsabilités :
- afficher l’interface,
- recueillir les préférences utilisateur,
- présenter les résultats,
- et soutenir l’expérience globale d’utilisation.

### 2) Logique de recommandation et données
Cette partie regroupe les scripts et modules utilisés pour le prétraitement, la recommandation et l’expérimentation.

Emplacements principaux :
- `src/`
- `app/`
- `notebooks/`

Responsabilités :
- préparation des données,
- logique de recommandation,
- expérimentation,
- et soutien au pipeline global du projet.

### 3) Module d’assistant IA
Ce module fournit une assistance conversationnelle de type chatbot et un accompagnement à l’utilisation.

Emplacement principal :
- `Assistant_IA/`

Responsabilités :
- servir le backend de l’assistant,
- gérer les services liés à l’assistant,
- stocker la documentation interne d’aide au site,
- et soutenir la logique et les notebooks associés.

### 4) Données, résultats et gestion de versions
Cette partie regroupe les jeux de données, les sorties traitées et les artefacts utilisés pendant le développement.

Emplacements principaux :
- `data/raw/`
- `data/processed/`
- `.dvc/`
- `docs/`

Responsabilités :
- stocker les données du projet,
- organiser les sorties traitées,
- soutenir la reproductibilité,
- et conserver les livrables académiques.

---

## Structure du dépôt

```text
CITYTASTE/
├── Assistant_IA/
│   ├── app.py
│   ├── services/
│   ├── docs_site/
│   ├── notebooks/
│   └── data/
├── app/
│   └── main.py
├── assets/
├── data/
│   ├── raw/
│   └── processed/
├── docs/
├── notebooks/
├── src/
├── index.html
├── app.js
├── styles.css
├── requirements.txt
└── README.md
```

---

## Technologies utilisées

### Front-end
- HTML
- CSS
- JavaScript

### Back-end / IA
- Python
- FastAPI
- Jupyter Notebook

### Données / outillage du projet
- CSV / GeoJSON
- DVC
- Artefacts basés sur Joblib
- Notebooks d’expérimentation

---

## Données et expérimentation

Le dépôt contient des données de projet et du matériel d’expérimentation utilisés pour soutenir le flux de recommandation.

Exemples d’éléments inclus :
- des dossiers de données brutes et traitées,
- des jeux de données nettoyés et enrichis,
- des métriques et résultats d’évaluation,
- des notebooks de prétraitement et d’analyse exploratoire,
- ainsi que de la documentation liée à l’architecture, à la gouvernance et aux livrables.

Certaines ressources locales, comme des modèles, des configurations privées ou des fichiers propres à une machine, peuvent être volontairement exclues du dépôt.

---

## Installation

### 1) Cloner le dépôt

```bash
git clone https://github.com/VivanBoy/CITYTASTE.git
cd CITYTASTE
```

### 2) Créer et activer un environnement virtuel

#### Windows
```bash
python -m venv .venv
.venv\Scripts\activate
```

#### macOS / Linux
```bash
python3 -m venv .venv
source .venv/bin/activate
```

### 3) Installer les dépendances

```bash
pip install -r requirements.txt
```

---

## Exécution du projet

### Option A — Lancer le front-end
Si tu veux uniquement tester l’interface, ouvre le projet avec un serveur web local comme **VS Code Live Server**.

Point d’entrée principal :

```text
index.html
```

### Option B — Lancer la couche applicative Python
Selon la partie du projet que tu veux tester, certaines fonctionnalités reposent sur les scripts situés dans :

```text
app/
src/
```

### Option C — Lancer le backend de l’assistant IA
Pour exécuter le backend de l’assistant :

```bash
cd Assistant_IA
uvicorn app:app --reload
```

> Remarque : certaines fonctionnalités de l’assistant peuvent dépendre de fichiers locaux, de données traitées ou d’une configuration de modèle local qui ne sont pas entièrement inclus dans le dépôt.

---

## Module d’assistant IA

Le dossier `Assistant_IA/` contient la couche de soutien conversationnel du projet.

On y retrouve :
- le point d’entrée de l’application assistant,
- les modules de services,
- les notebooks,
- et la documentation interne d’aide au site.

Ce module vise à améliorer l’expérience utilisateur en répondant aux questions liées à la plateforme et en aidant les utilisateurs à mieux naviguer dans CityTaste.

---

## Documentation

Le dossier `docs/` contient des documents académiques et de gestion de projet, par exemple :
- des fichiers de planification,
- des documents de gouvernance et de charte,
- des livrables d’architecture et d’intégration,
- des fichiers de présentation,
- et des documents liés aux données.

Cela rend le dépôt utile non seulement comme projet logiciel, mais aussi comme portfolio complet de projet capstone.

---

## Cas d’usage

CityTaste peut soutenir des scénarios comme :
- trouver des restaurants à Ottawa selon une cuisine particulière,
- explorer des hébergements pour des visiteurs,
- comparer des lieux grâce à un processus de recommandation structuré,
- comprendre les filtres et les résultats grâce à un assistant IA,
- et présenter un projet appliqué en IA avec des livrables techniques et académiques.

---

## Améliorations futures

Les prochaines étapes possibles pour le projet incluent :
- le déploiement complet de l’application,
- l’amélioration du support bilingue,
- l’ajout d’explications plus solides sur le classement,
- l’intégration d’une visualisation cartographique,
- l’expansion de la personnalisation utilisateur,
- et l’amélioration des flux d’évaluation et de production de rapports.

---

## Auteur

**Innocent Niyobuhungiro**  
Programme d’intelligence artificielle  
La Cité Collégiale  
Ottawa, Canada

---

## Note finale

CityTaste reflète une approche pratique d’un projet capstone en IA qui relie les données, les systèmes de recommandation, l’expérience utilisateur et l’assistance conversationnelle dans un même projet.

Il s’agit à la fois d’un prototype technique et d’une pièce de portfolio académique démontrant un travail appliqué à travers plusieurs étapes du cycle de développement d’un projet d’IA.
