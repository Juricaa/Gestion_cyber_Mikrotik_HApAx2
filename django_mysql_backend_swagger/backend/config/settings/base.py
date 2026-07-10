import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent.parent
PROJECT_DIR = BASE_DIR.parent
ROOT_DIR = PROJECT_DIR.parent

# Utilise un seul fichier .env à la racine du projet.
# En Docker, les variables sont injectées par docker-compose.yml.
load_dotenv(ROOT_DIR / ".env")


def csv_env(name, default=""):
    return [
        item.strip()
        for item in os.getenv(name, default).split(",")
        if item.strip()
    ]

SECRET_KEY = os.getenv("DJANGO_SECRET_KEY", "change-me-in-development")
DEBUG = os.getenv("DJANGO_DEBUG", "False").lower() == "true"
ALLOWED_HOSTS = csv_env(
    "DJANGO_ALLOWED_HOSTS",
    "127.0.0.1,localhost,192.168.88.252,192.168.88.254",
)

INSTALLED_APPS = [
    "corsheaders",
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",

    
    "rest_framework",
    "drf_spectacular",
    "drf_spectacular_sidecar",

    "apps.accounts.apps.AccountsConfig",
    "apps.stations.apps.StationsConfig",
    "apps.backups.apps.BackupsConfig",
    "apps.pricing.apps.PricingConfig",
    "apps.sessions_app.apps.SessionsAppConfig",
    "apps.sales.apps.SalesConfig",
    "apps.reports.apps.ReportsConfig",
    "apps.auditlog.apps.AuditlogConfig",
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    }
]

WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

DATABASES = {
 "default": {
        "ENGINE": "django.db.backends.mysql",
        "NAME": os.getenv("MYSQL_DATABASE"),
        "USER": os.getenv("MYSQL_USER"),
        "PASSWORD": os.getenv("MYSQL_PASSWORD"),
        "HOST": os.getenv("MYSQL_HOST"),
        "PORT": os.getenv("MYSQL_PORT"),
        "CONN_MAX_AGE": int(os.getenv("MYSQL_CONN_MAX_AGE", "60")),
        "OPTIONS": {
            "charset": "utf8mb4",
            "init_command": "SET sql_mode='STRICT_TRANS_TABLES', default_storage_engine=InnoDB",
        },
    }
}

AUTH_USER_MODEL = "accounts.User"

LANGUAGE_CODE = "fr-fr"
TIME_ZONE = "Indian/Antananarivo"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework.authentication.SessionAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
}

SPECTACULAR_SETTINGS = {
    "TITLE": "Cyber Manager API",
    "DESCRIPTION": "API de gestion des sessions WiFi/console, tarifs, ventes de films et rapports.",
    "VERSION": "1.0.0",
    "SERVE_INCLUDE_SCHEMA": False,
    "SWAGGER_UI_DIST": "SIDECAR",
    "SWAGGER_UI_FAVICON_HREF": "SIDECAR",
    "REDOC_DIST": "SIDECAR",
    "SWAGGER_UI_SETTINGS": {
        "deepLinking": True,
        "persistAuthorization": True,
        "displayOperationId": False,
        "filter": True,
    },
}

CORS_ALLOW_CREDENTIALS = True

# Origines autorisées pour le frontend Vite.
# Important : avec credentials: "include", on ne peut pas utiliser CORS_ALLOW_ALL_ORIGINS=True.


CORS_ALLOWED_ORIGINS = csv_env("CORS_ALLOWED_ORIGINS")
CSRF_TRUSTED_ORIGINS = csv_env("CSRF_TRUSTED_ORIGINS")


SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = "Lax"
SESSION_COOKIE_SECURE = False

# Le frontend lit le cookie csrftoken pour envoyer X-CSRFToken.
CSRF_COOKIE_HTTPONLY = False
CSRF_COOKIE_SAMESITE = "Lax"
CSRF_COOKIE_SECURE = False