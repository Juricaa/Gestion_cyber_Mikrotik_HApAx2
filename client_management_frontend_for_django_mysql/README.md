# Client Management Frontend for Django + MySQL

Frontend React + Vite adapté au backend `django_mysql_backend_swagger.zip`.

## Points déjà adaptés

- Authentification Django par session + CSRF
- Fallback automatique pour les routes d'auth (`/api/auth/...` et `/api/auth/api/auth/...`)
- Sessions: liste, création, pause, reprise, terminaison, archive
- Tarification: lecture et mise à jour via `/api/pricing/`
- Ventes produits: lecture, création, suppression via `/api/film-sales/`
- Dashboard: compatible avec `/api/reports/dashboard/`

## Configuration

Créer un fichier `.env`:

```env
VITE_API_BASE_URL=http://127.0.0.1:8000
```

## Lancement

```bash
npm install
npm run dev
```

## Important côté backend

Dans le backend actuel, `apps/accounts/urls.py` contient déjà le préfixe `api/auth/` alors que `config/urls.py` inclut aussi `api/auth/`.

Donc les vraies routes peuvent devenir:

- `/api/auth/api/auth/csrf/`
- `/api/auth/api/auth/login/`
- `/api/auth/api/auth/logout/`
- `/api/auth/api/auth/me/`

Ce frontend gère automatiquement ce cas, même si vous corrigez plus tard le backend pour revenir à des routes propres.
