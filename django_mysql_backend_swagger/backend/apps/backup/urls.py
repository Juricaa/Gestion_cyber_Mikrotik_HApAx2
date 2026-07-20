from django.urls import include, path
from rest_framework import permissions
from rest_framework.routers import DefaultRouter

from apps.accounts.permissions import IsAdminRole

from .authentication import SessionAuthenticationWithoutCsrf
from .views import BackupViewSet

router = DefaultRouter()
router.register("", BackupViewSet, basename="backup")

urlpatterns = [
    # Sauvegarde métier rapide : disponible à tout utilisateur connecté.
    # Elle n'inclut ni comptes, ni mots de passe, ni configuration MikroTik.
    path(
        "business/",
        BackupViewSet.as_view(
            {"post": "create_business"},
            permission_classes=[permissions.IsAuthenticated],
            authentication_classes=[SessionAuthenticationWithoutCsrf],
        ),
        name="backup-business-create",
    ),
    # Restauration sélective depuis un fichier déjà présent dans la liste.
    # La session Django suffit ; aucun jeton CSRF manuel n'est demandé.
    path(
        "restore-business/",
        BackupViewSet.as_view(
            {"post": "restore_business"},
            permission_classes=[permissions.IsAuthenticated],
            authentication_classes=[SessionAuthenticationWithoutCsrf],
        ),
        name="backup-business-restore",
    ),
    # Import externe conservé pour l'administrateur uniquement.
    path(
        "import-business/",
        BackupViewSet.as_view(
            {"post": "import_business"},
            permission_classes=[IsAdminRole],
            authentication_classes=[SessionAuthenticationWithoutCsrf],
        ),
        name="backup-import-business",
    ),
    path("restore/", BackupViewSet.as_view({"post": "restore"}), name="backup-restore"),
    path("", include(router.urls)),
]
