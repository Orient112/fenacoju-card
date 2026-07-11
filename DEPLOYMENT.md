# Déploiement FENACOJU Card — Supabase + Vercel + Render

Architecture cible :

```text
[Vercel]  → Frontend React (fenacoju-card.vercel.app)
    ↓ VITE_API_URL
[Render]  → API Express (server/)
    ↓
[Supabase] → PostgreSQL + Storage (fenacoju-uploads)
```

---

## Étape 1 — Créer le projet Supabase

1. Allez sur [supabase.com](https://supabase.com) → **New project**
2. Nommez-le `fenacoju-card`, choisissez une région proche (ex. Frankfurt)
3. Une fois créé, ouvrez **SQL Editor** → **New query**
4. Copiez-collez tout le contenu de `supabase/schema.sql` et cliquez **Run**
5. Vérifiez dans **Table Editor** : tables `users`, `sessions`, `judokas`, `messages`
6. Vérifiez dans **Storage** : bucket `fenacoju-uploads` (public)

### Récupérer les clés Supabase

Dans **Project Settings → API** :

| Variable | Où la trouver |
|---|---|
| `SUPABASE_URL` | Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role (secret — ne jamais exposer côté frontend) |

---

## Étape 2 — Migrer les données locales (optionnel)

Si vous avez déjà des données dans `data/*.json` :

```bash
# Créez .env à la racine (copiez .env.example)
cp .env.example .env
# Remplissez SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY

npm run migrate:supabase
```

---

## Étape 3 — Pousser le code sur GitHub

1. Créez un dépôt GitHub `fenacoju-card` (privé recommandé)
2. Dans le terminal, à la racine du projet :

```bash
git init
git add .
git commit -m "Migration Supabase + configuration Vercel"
git branch -M main
git remote add origin https://github.com/VOTRE_COMPTE/fenacoju-card.git
git push -u origin main
```

---

## Étape 4 — Créer le projet Vercel « fenacoju-card »

Sur votre tableau de bord Vercel (compte **Orient's projects**) :

### 4.1 Importer le dépôt

1. Cliquez **Add New** (en haut à droite) → **Project**
2. Si GitHub n'est pas connecté : **Connect Git Repository** → autorisez Vercel
3. Sélectionnez le dépôt `fenacoju-card`
4. Cliquez **Import**

### 4.2 Configurer le build

Vercel détecte automatiquement Vite. Vérifiez :

| Paramètre | Valeur |
|---|---|
| Framework Preset | **Vite** |
| Root Directory | `.` (racine) |
| Build Command | `npm run build` |
| Output Directory | `dist` |
| Install Command | `npm install` |

Le fichier `vercel.json` à la racine applique déjà ces réglages + le routage SPA.

### 4.3 Nommer le projet

- **Project Name** : `fenacoju-card`
- L'URL sera : `https://fenacoju-card.vercel.app`

### 4.4 Variables d'environnement (frontend)

Avant de déployer, ajoutez dans **Environment Variables** :

| Nom | Valeur | Environnement |
|---|---|---|
| `VITE_API_URL` | *(vide pour l'instant — on la remplira après Render)* | Production, Preview, Development |

> **Note** : laissez vide au premier déploiement, ou mettez `http://localhost:3001` pour tester. Vous la mettrez à jour une fois le backend Render déployé.

5. Cliquez **Deploy**

Le premier build prend 1–2 minutes. Vous obtiendrez `https://fenacoju-card.vercel.app`.

---

## Étape 5 — Déployer le backend sur Render

L'API Express ne tourne pas nativement sur Vercel Hobby. Utilisez **Render** (gratuit) :

1. Allez sur [render.com](https://render.com) → **New → Web Service**
2. Connectez le même dépôt GitHub `fenacoju-card`
3. Configuration :

| Paramètre | Valeur |
|---|---|
| Name | `fenacoju-card-api` |
| Region | Frankfurt (ou proche) |
| Branch | `main` |
| Root Directory | *(vide — racine)* |
| Runtime | **Node** |
| Build Command | `npm install` |
| Start Command | `npm start` |
| Instance Type | **Free** |

### Variables d'environnement Render

| Nom | Valeur |
|---|---|
| `PORT` | `3001` |
| `NODE_ENV` | `production` |
| `SUPABASE_URL` | *(votre URL Supabase)* |
| `SUPABASE_SERVICE_ROLE_KEY` | *(votre clé service_role)* |
| `SUPABASE_STORAGE_BUCKET` | `fenacoju-uploads` |
| `CORS_ORIGIN` | `https://fenacoju-card.vercel.app` |

4. Cliquez **Create Web Service**
5. Une fois déployé, notez l'URL : ex. `https://fenacoju-card-api.onrender.com`

### Vérifier le backend

Ouvrez dans le navigateur :

```
https://fenacoju-card-api.onrender.com/api/health
```

Réponse attendue : `{"ok":true,"storage":"supabase"}`

---

## Étape 6 — Relier Vercel au backend

1. Retournez sur Vercel → projet **fenacoju-card** → **Settings → Environment Variables**
2. Modifiez `VITE_API_URL` :

```
https://fenacoju-card-api.onrender.com
```

(sans slash final)

3. Allez dans **Deployments** → cliquez **⋯** sur le dernier déploiement → **Redeploy**

---

## Étape 7 — Test final

1. Ouvrez `https://fenacoju-card.vercel.app`
2. Connectez-vous : `admin` / `@Fenacoju`
3. Testez :
   - Création d'un judoka avec photo
   - Enregistrement d'un club avec documents
   - Messagerie interne
   - Génération de carte judoka

---

## Variables d'environnement — récapitulatif

### Frontend (Vercel)

```env
VITE_API_URL=https://fenacoju-card-api.onrender.com
```

### Backend (Render)

```env
PORT=3001
NODE_ENV=production
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
SUPABASE_STORAGE_BUCKET=fenacoju-uploads
CORS_ORIGIN=https://fenacoju-card.vercel.app
```

### Local (.env)

```env
VITE_API_URL=http://localhost:3001
PORT=3001
CORS_ORIGIN=http://localhost:5173
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
SUPABASE_STORAGE_BUCKET=fenacoju-uploads
```

---

## Dépannage

| Problème | Solution |
|---|---|
| `Failed to fetch` au login | Vérifiez `VITE_API_URL` sur Vercel + redeploy |
| Erreur CORS | Ajoutez l'URL Vercel exacte dans `CORS_ORIGIN` sur Render |
| Photos/documents invisibles | Vérifiez que le bucket `fenacoju-uploads` est **public** dans Supabase Storage |
| Backend lent (cold start) | Normal sur Render Free — première requête peut prendre ~30 s |
| `supabase: false` dans /api/health | Variables Supabase manquantes sur Render — `storage` sera `"local"` |

---

## Compte admin par défaut

| Identifiant | Mot de passe |
|---|---|
| `admin` | `@Fenacoju` |

Créé automatiquement au premier démarrage du serveur si absent en base.
