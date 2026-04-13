# CityTaste
🇫🇷 Version française : [README.fr.md](README.fr.md)

<p align="center">
  <strong>An AI-powered recommendation platform for discovering restaurants and accommodations in Ottawa.</strong>
</p>

<p align="center">
  CityTaste combines data preparation, recommendation logic, a web interface, and an AI assistant to help users find relevant places faster and more confidently.
</p>

---

## Table of Contents
- [Project Overview](#project-overview)
- [Problem Statement](#problem-statement)
- [Solution](#solution)
- [Main Features](#main-features)
- [Project Architecture](#project-architecture)
- [Repository Structure](#repository-structure)
- [Technologies Used](#technologies-used)
- [Data and Experimentation](#data-and-experimentation)
- [Installation](#installation)
- [How to Run](#how-to-run)
- [AI Assistant Module](#ai-assistant-module)
- [Documentation](#documentation)
- [Use Cases](#use-cases)
- [Future Improvements](#future-improvements)
- [Author](#author)

---

## Project Overview

**CityTaste** is a capstone project developed to improve the way users discover restaurants and accommodations in **Ottawa**.

Instead of browsing multiple websites and comparing scattered information manually, users can explore relevant places through a single interface powered by filtering, ranking, and AI-assisted guidance.

The project brings together:
- a **front-end web application** for exploration and recommendations,
- a **Python-based recommendation workflow**,
- an **AI assistant** for user support and platform guidance,
- and a structured set of **datasets, notebooks, and project documents**.

---

## Problem Statement

In a city like Ottawa, people often spend a lot of time comparing restaurants, hotels, and other places across different platforms.

Common challenges include:
- too many options with inconsistent information,
- difficulty filtering by cuisine, distance, or dietary needs,
- generic results that do not feel personalized,
- and a lack of clear explanations about why a place is recommended.

This problem can affect different user groups such as students, residents, newcomers, families, and tourists.

---

## Solution

CityTaste was designed to centralize this search experience and make recommendations easier to understand.

The platform helps users:
- search for places in Ottawa,
- filter results by relevant preferences,
- obtain ranked recommendations,
- and interact with an assistant that explains features and guides usage.

The broader goal is to demonstrate an end-to-end AI project that connects **data preparation**, **recommendation logic**, **web design**, and **conversational support** in one coherent solution.

---

## Main Features

- Restaurant and accommodation discovery in Ottawa
- Search and filtering by place type, cuisine, and other criteria
- Ranked recommendation results
- AI assistant for support and guidance
- Data preparation and enrichment workflows
- Experimentation notebooks for analysis and development
- Academic and technical project documentation

---

## Project Architecture

CityTaste is organized into four major parts.

### 1) Front-End Interface
This is the main user-facing layer of the project.

Main files:
- `index.html`
- `app.js`
- `styles.css`
- `assets/`

Responsibilities:
- display the interface,
- collect user preferences,
- show results,
- and support the general user experience.

### 2) Recommendation and Data Logic
This part contains the scripts and modules used for preprocessing, recommendation, and experimentation.

Main locations:
- `src/`
- `app/`
- `notebooks/`

Responsibilities:
- data preparation,
- recommendation logic,
- experimentation,
- and support for the project pipeline.

### 3) AI Assistant Module
This module provides chatbot-style assistance and user guidance.

Main location:
- `Assistant_IA/`

Responsibilities:
- serve the assistant backend,
- manage assistant-related services,
- store internal site-help content,
- and support assistant-oriented notebooks and logic.

### 4) Data, Outputs, and Versioning
This part stores the datasets, processed outputs, and project artifacts used throughout development.

Main locations:
- `data/raw/`
- `data/processed/`
- `.dvc/`
- `docs/`

Responsibilities:
- store project data,
- keep processed outputs organized,
- support reproducibility,
- and preserve academic deliverables.

---

## Repository Structure

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

## Technologies Used

### Front-End
- HTML
- CSS
- JavaScript

### Back-End / AI
- Python
- FastAPI
- Jupyter Notebook

### Data / Project Tooling
- CSV / GeoJSON
- DVC
- Joblib-based artifacts
- Experimentation notebooks

---

## Data and Experimentation

The repository includes project data and experimentation material used to support the recommendation workflow.

Examples of included assets:
- raw and processed data folders,
- cleaned and enriched datasets,
- metrics and evaluation outputs,
- preprocessing and EDA notebooks,
- and project documentation related to architecture, governance, and deliverables.

Some local resources such as models, private configuration, or machine-specific files may be intentionally excluded from the repository.

---

## Installation

### 1) Clone the repository

```bash
git clone https://github.com/VivanBoy/CITYTASTE.git
cd CITYTASTE
```

### 2) Create and activate a virtual environment

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

### 3) Install dependencies

```bash
pip install -r requirements.txt
```

---

## How to Run

### Option A — Run the Front-End
If you only want to test the interface, open the project with a local web server such as **VS Code Live Server**.

Main entry point:

```text
index.html
```

### Option B — Run the Python App Layer
Depending on the workflow you want to test, some functionality may rely on the scripts inside:

```text
app/
src/
```

### Option C — Run the AI Assistant Backend
To run the assistant backend:

```bash
cd Assistant_IA
uvicorn app:app --reload
```

> Note: some assistant features may depend on local files, processed data, or local model configuration that are not fully committed to the repository.

---

## AI Assistant Module

The `Assistant_IA/` directory contains the conversational support layer of the project.

It includes:
- the assistant application entry point,
- service modules,
- notebooks,
- and internal site-help documentation.

This module is intended to improve the user experience by answering questions related to the platform and helping users navigate CityTaste more effectively.

---

## Documentation

The `docs/` directory contains academic and project-management materials such as:
- project planning files,
- governance and charter documents,
- architecture and integration deliverables,
- presentation files,
- and data-related documents.

This makes the repository useful not only as a software project, but also as a complete capstone project portfolio.

---

## Use Cases

CityTaste can support scenarios such as:
- finding restaurants in Ottawa based on cuisine,
- exploring accommodations for visitors,
- comparing places using a structured recommendation process,
- understanding filters and results through an AI assistant,
- and presenting an applied AI project with both technical and academic deliverables.

---

## Future Improvements

Possible next steps for the project include:
- deploying the full application,
- improving bilingual support,
- adding stronger ranking explanations,
- integrating map-based visualization,
- expanding user personalization,
- and improving evaluation and reporting workflows.

---

## Author

**Innocent Niyobuhungiro**  
**Japhet Bonheur Beda Valeria**
Artificial Intelligence Program  
La Cité Collégiale  
Ottawa, Canada

---

## Final Note

CityTaste reflects a practical AI capstone approach that connects data, recommendation systems, user experience, and conversational assistance in one project.

It is both a technical prototype and an academic portfolio piece demonstrating applied work across multiple stages of an AI development lifecycle.
