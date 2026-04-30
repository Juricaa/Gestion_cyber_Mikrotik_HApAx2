from django.contrib.auth import authenticate, login, logout
from django.db.models import Q
from django.views.decorators.csrf import ensure_csrf_cookie, csrf_exempt, csrf_protect

from rest_framework import permissions, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiExample, OpenApiParameter, extend_schema

from .models import User
from .permissions import IsAdminRole
from .serializers import (
    CreateUserSerializer,
    LoginSerializer,
    MeSerializer,
    UpdateUserSerializer,
    UserSerializer,
)


csrf_header = OpenApiParameter(
    name="X-CSRFToken",
    type=OpenApiTypes.STR,
    location=OpenApiParameter.HEADER,
    required=False,
    description="Token CSRF venant du cookie csrftoken.",
)


def _active_admins_queryset():
    return User.objects.filter(Q(role=User.Role.ADMIN) | Q(is_superuser=True), is_active=True)


def _is_last_active_admin(user: User) -> bool:
    if not user.is_active:
        return False
    if user.role != User.Role.ADMIN and not user.is_superuser:
        return False
    return not _active_admins_queryset().exclude(pk=user.pk).exists()


@extend_schema(
    tags=["Authentification"],
    summary="Obtenir le cookie CSRF",
    description="Cette route crée le cookie csrftoken pour pouvoir tester login/logout dans Swagger.",
    responses={200: {"type": "object", "properties": {"detail": {"type": "string"}}}},
)
@api_view(["GET"])
@permission_classes([permissions.AllowAny])
@ensure_csrf_cookie
def csrf(request):
    return Response({"detail": "CSRF cookie set"})


@extend_schema(
    tags=["Authentification"],
    summary="Connexion",
    description="Connexion avec username et password. Crée une session Django.",
    request=LoginSerializer,
    parameters=[csrf_header],
    responses={
        200: MeSerializer,
        400: {"type": "object", "properties": {"detail": {"type": "string"}}},
    },
    examples=[
        OpenApiExample(
            "Exemple login",
            value={"username": "admin", "password": "admin123"},
            request_only=True,
        )
    ],
)
@api_view(["POST"])
@permission_classes([permissions.AllowAny])
@csrf_exempt
def login_view(request):
    serializer = LoginSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    user = authenticate(
        request,
        username=serializer.validated_data["username"],
        password=serializer.validated_data["password"],
    )

    if not user:
        return Response(
            {"detail": "Identifiants invalides"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if not user.is_active:
        return Response(
            {"detail": "Compte désactivé"},
            status=status.HTTP_403_FORBIDDEN,
        )

    login(request, user)
    return Response({"user": MeSerializer(user).data})


@extend_schema(
    tags=["Authentification"],
    summary="Déconnexion",
    description="Déconnecte l'utilisateur connecté.",
    parameters=[csrf_header],
    responses={200: {"type": "object", "properties": {"detail": {"type": "string"}}}},
)
@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def logout_view(request):
    logout(request)
    return Response({"detail": "Déconnecté"})


@extend_schema(
    tags=["Authentification"],
    summary="Utilisateur connecté",
    description="Retourne les informations de l'utilisateur connecté.",
    responses={200: MeSerializer},
)
@api_view(["GET"])
@permission_classes([permissions.IsAuthenticated])
def me_view(request):
    return Response(MeSerializer(request.user).data)


@extend_schema(
    tags=["Utilisateurs"],
    summary="Lister ou créer des utilisateurs",
    description="GET liste les utilisateurs. POST crée un utilisateur. Accès admin uniquement.",
    request=CreateUserSerializer,
    parameters=[csrf_header],
    responses={200: UserSerializer(many=True), 201: UserSerializer},
)
@api_view(["GET", "POST"])
@permission_classes([IsAdminRole])
@csrf_protect
def users_view(request):
    if request.method == "GET":
        users = User.objects.all().order_by("id")
        return Response(UserSerializer(users, many=True).data)

    serializer = CreateUserSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    user = serializer.save()
    return Response(UserSerializer(user).data, status=status.HTTP_201_CREATED)


@extend_schema(
    tags=["Utilisateurs"],
    summary="Créer un utilisateur",
    description="Ancienne route gardée pour compatibilité. Utilise maintenant /api/auth/users/ de préférence.",
    request=CreateUserSerializer,
    parameters=[csrf_header],
    responses={201: UserSerializer},
)
@api_view(["POST"])
@permission_classes([IsAdminRole])
@csrf_protect
def create_user_view(request):
    serializer = CreateUserSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    user = serializer.save()
    return Response(
        {"detail": "Utilisateur créé avec succès", "user": UserSerializer(user).data},
        status=status.HTTP_201_CREATED,
    )


@extend_schema(
    tags=["Utilisateurs"],
    summary="Modifier ou supprimer un utilisateur",
    description="PATCH/PUT modifie un utilisateur. DELETE supprime un utilisateur. Accès admin uniquement.",
    request=UpdateUserSerializer,
    parameters=[csrf_header],
    responses={200: UserSerializer, 204: None},
)
@api_view(["PATCH", "PUT", "DELETE"])
@permission_classes([IsAdminRole])
@csrf_protect
def user_detail_view(request, user_id: int):
    try:
        user = User.objects.get(pk=user_id)
    except User.DoesNotExist:
        return Response({"detail": "Utilisateur introuvable"}, status=status.HTTP_404_NOT_FOUND)

    if request.method == "DELETE":
        if user.pk == request.user.pk:
            return Response(
                {"detail": "Impossible de supprimer votre propre compte connecté."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if _is_last_active_admin(user):
            return Response(
                {"detail": "Impossible de supprimer le dernier administrateur actif."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        user.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    partial = request.method == "PATCH"
    serializer = UpdateUserSerializer(user, data=request.data, partial=partial)
    serializer.is_valid(raise_exception=True)

    requested_role = serializer.validated_data.get("role", user.role)
    requested_is_active = serializer.validated_data.get("is_active", user.is_active)

    if user.pk == request.user.pk and requested_is_active is False:
        return Response(
            {"detail": "Impossible de désactiver votre propre compte connecté."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if _is_last_active_admin(user):
        will_remove_admin = requested_is_active is False or requested_role != User.Role.ADMIN
        if will_remove_admin:
            return Response(
                {"detail": "Impossible de retirer le dernier administrateur actif."},
                status=status.HTTP_400_BAD_REQUEST,
            )

    updated = serializer.save()
    return Response(UserSerializer(updated).data)
