# FENACOJU Card

Application web de gestion et d'enregistrement des judokas pour la génération de cartes d'identification.

## Fonctionnalités

- **Enregistrement** des judokas (nom, prénom, date de naissance, club, grade, photo, etc.)
- **Génération automatique** du numéro de carte (format `FCJ-2026-0001`)
- **Visualisation et impression** des cartes judoka
- **Recherche** par nom, club ou numéro de carte
- **Modification et suppression** des enregistrements
- **Tableau de bord** avec statistiques

## Prérequis

- [Node.js](https://nodejs.org/) version 18 ou supérieure

## Installation

```bash
npm install
```

## Lancement en développement

```bash
npm run dev
```

L'application sera accessible sur :
- **Frontend** : http://localhost:5173
- **API** : http://localhost:3001

## Production

```bash
npm run build
npm start
```

L'application sera accessible sur http://localhost:3001

## Structure

```
├── server/          # API Express + stockage JSON
│   ├── index.js     # Routes API
│   └── database.js  # Base de données
├── src/             # Frontend React
│   ├── components/  # Composants UI
│   └── App.jsx      # Application principale
├── data/            # Données JSON (auto-créées)
└── uploads/         # Photos des judokas
```

## API

| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/api/stats` | Statistiques |
| GET | `/api/judokas` | Liste des judokas |
| GET | `/api/judokas/:id` | Détail d'un judoka |
| POST | `/api/judokas` | Créer un judoka |
| PUT | `/api/judokas/:id` | Modifier un judoka |
| DELETE | `/api/judokas/:id` | Supprimer un judoka |
