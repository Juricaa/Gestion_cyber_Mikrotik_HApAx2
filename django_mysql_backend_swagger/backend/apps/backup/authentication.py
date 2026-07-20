from rest_framework.authentication import SessionAuthentication


class SessionAuthenticationWithoutCsrf(SessionAuthentication):
    """Authentification par session Django sans contrôle CSRF.

    Réservée aux routes de migration/sauvegarde explicitement déclarées dans
    ``apps.backup.urls``. La session utilisateur reste obligatoire ; seule la
    saisie manuelle d'un jeton CSRF est supprimée.
    """

    def enforce_csrf(self, request):
        return
