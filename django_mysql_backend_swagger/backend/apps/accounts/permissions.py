from rest_framework import permissions


class IsAdminRole(permissions.BasePermission):
    message = "Accès refusé. Seul un administrateur peut faire cette action."

    def has_permission(self, request, view):
        user = getattr(request, "user", None)
        return bool(
            user
            and user.is_authenticated
            and (
                getattr(user, "role", None) == "admin"
                or getattr(user, "is_superuser", False)
            )
        )
