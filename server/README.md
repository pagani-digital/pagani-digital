# Pagani Digital — Serveur Backend

## Installation

### 1. Installer Node.js
Télécharge et installe Node.js depuis : https://nodejs.org (version LTS recommandée)

### 2. Installer les dépendances
```bash
cd "D:\Projet pagani\server"
npm install
```

### 3. Configurer le fichier .env
Le fichier `.env` est déjà créé. Modifie `JWT_SECRET` avec une valeur secrète unique.

### 4. Démarrer le serveur
```bash
# Mode production
npm start

# Mode développement (redémarre automatiquement)
npm run dev
```

Le serveur démarre sur http://localhost:3001

---

## Architecture de sécurité

```
Utilisateur clique sur vidéo payante
        ↓
Frontend vérifie le plan (Pro/Elite)
        ↓
Appel GET /api/videos/:id/token  (avec JWT auth)
        ↓
Serveur vérifie le plan dans la DB
        ↓
Serveur génère un token signé contenant le driveId (expire dans 2h)
        ↓
Frontend appelle GET /api/videos/resolve/:token
        ↓
Serveur vérifie que le token appartient à cet utilisateur
        ↓
Serveur retourne le driveId en mémoire uniquement
        ↓
Frontend charge l'iframe Drive — driveId jamais stocké côté client
```

## Routes API

| Méthode | Route | Auth | Description |
|---------|-------|------|-------------|
| POST | /api/auth/register | Non | Inscription |
| POST | /api/auth/login | Non | Connexion |
| GET | /api/auth/me | JWT | Profil connecté |
| GET | /api/videos | Non | Liste publique (sans IDs privés) |
| GET | /api/videos/:id/token | JWT + Pro/Elite | Token vidéo temporaire |
| GET | /api/videos/resolve/:token | JWT | Résoudre token → driveId |
| GET | /api/admin/videos | JWT + Admin | Liste complète avec IDs |
| POST | /api/admin/videos | JWT + Admin | Créer vidéo |
| PUT | /api/admin/videos/:id | JWT + Admin | Modifier vidéo |
| DELETE | /api/admin/videos/:id | JWT + Admin | Supprimer vidéo |
| GET | /api/admin/stats | JWT + Admin | Statistiques |

## Déploiement gratuit

### Railway (recommandé)
1. Crée un compte sur https://railway.app
2. Connecte ton repo GitHub
3. Ajoute les variables d'environnement dans Railway
4. Change `FRONTEND_ORIGIN` dans `.env` avec l'URL de ton frontend

### Render
1. Crée un compte sur https://render.com
2. New Web Service → connecte ton repo
3. Build Command: `npm install`
4. Start Command: `npm start`
