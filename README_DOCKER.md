# Lancer le projet avec Docker

## 1. Emplacement des fichiers
Copie ces fichiers dans la racine de ton projet, en gardant exactement les mêmes chemins :

```text
docker-compose.yml
client_management_frontend_for_django_mysql/Dockerfile
client_management_frontend_for_django_mysql/.dockerignore
django_mysql_backend_swagger/backend/Dockerfile
django_mysql_backend_swagger/backend/.dockerignore
django_mysql_backend_swagger/backend/requirements.txt
```

## 2. Lancer tout le projet
Depuis la racine du projet :

```bash
docker compose up --build
```

Accès :

```text
Frontend : http://localhost:5173
Backend  : http://localhost:8000
Swagger  : http://localhost:8000/api/docs/
Admin    : http://localhost:8000/admin/
MariaDB  : localhost:3307 depuis Windows, db:3306 depuis Docker
Backups  : dossier partagé ./backups (monté dans Docker vers /app/backups)
```

## 3. Créer un superuser Django
Dans un autre terminal :
Pour garder Docker actif mais libérer le terminal, appuie sur :
```bash
Ctrl + C

## Puis relance en arrière-plan avec :
```bash
docker compose up -d

## Pour voir les logs après :
docker compose logs -f

# Et pour créer l’utilisateur admin Django :
```bash
docker compose exec backend python manage.py createsuperuser
```

## 4. Arrêter le projet

```bash
docker compose down
```

## 5. Supprimer aussi la base de données Docker
Attention : cette commande efface les données MariaDB du volume Docker.

```bash
docker compose down -v
```

## 6. Si tu ouvres depuis un autre appareil du réseau
Dans `docker-compose.yml`, remplace côté frontend :

```yaml
VITE_API_BASE_URL: http://localhost:8000
```

par l'adresse IP de ton PC, par exemple :

```yaml
VITE_API_BASE_URL: http://192.168.88.252:8000
```

Puis relance :

```bash
docker compose up --build
```
