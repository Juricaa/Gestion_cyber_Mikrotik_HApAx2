from django.db import transaction
from rest_framework import serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import IsAdminRole
from apps.auditlog.models import AuditLog

from .mikrotik import (
    EffectiveMikroTikConfiguration,
    MikroTikClient,
    MikroTikError,
    get_effective_mikrotik_configuration,
    normalize_mikrotik_base_url,
)
from .models import MikroTikConfiguration


class MikroTikConfigurationSerializer(serializers.Serializer):
    base_url = serializers.CharField(required=False, allow_blank=True, max_length=255)
    username = serializers.CharField(required=False, allow_blank=True, max_length=128)
    password = serializers.CharField(required=False, allow_blank=True, write_only=True, trim_whitespace=False)
    enabled = serializers.BooleanField(required=False)
    verify_ssl = serializers.BooleanField(required=False)
    hotspot_profile = serializers.CharField(required=False, allow_blank=True, max_length=128)

    def validate_base_url(self, value):
        try:
            return normalize_mikrotik_base_url(value)
        except ValueError as exc:
            raise serializers.ValidationError(str(exc)) from exc

    def validate(self, attrs):
        effective = get_effective_mikrotik_configuration()
        enabled = attrs.get("enabled", effective.enabled)
        base_url = attrs.get("base_url", effective.base_url)
        username = attrs.get("username", effective.username)
        password = attrs.get("password") or effective.password

        if enabled and not base_url:
            raise serializers.ValidationError({"base_url": "L'adresse du routeur est obligatoire."})
        if enabled and not username:
            raise serializers.ValidationError({"username": "Le nom d'utilisateur est obligatoire."})
        if enabled and not password:
            raise serializers.ValidationError({"password": "Le mot de passe MikroTik est obligatoire."})

        return attrs


def _public_configuration() -> dict:
    return get_effective_mikrotik_configuration().public_dict()


class MikroTikConfigurationView(APIView):
    permission_classes = [IsAdminRole]

    def get(self, request):
        return Response(_public_configuration())

    @transaction.atomic
    def put(self, request):
        return self._save(request, partial=False)

    @transaction.atomic
    def patch(self, request):
        return self._save(request, partial=True)

    def _save(self, request, partial):
        serializer = MikroTikConfigurationSerializer(data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        config, _ = MikroTikConfiguration.objects.select_for_update().get_or_create(singleton_key=1)
        changed_fields = []

        for field in ("base_url", "username", "enabled", "verify_ssl", "hotspot_profile"):
            if field in data:
                value = data[field]
                if field == "hotspot_profile":
                    value = value.strip() or "paid_wifi"
                setattr(config, field, value)
                changed_fields.append(field)

        password_changed = bool(data.get("password"))
        if password_changed:
            config.set_password(data["password"])
            changed_fields.append("password")

        config.updated_by = request.user
        config.save()

        AuditLog.objects.create(
            user=request.user,
            action="mikrotik_configuration_updated",
            entity_type="MikroTikConfiguration",
            entity_id=str(config.id),
            payload={
                "changed_fields": changed_fields,
                "base_url": config.base_url,
                "username": config.username,
                "enabled": config.enabled,
                "verify_ssl": config.verify_ssl,
                "hotspot_profile": config.hotspot_profile,
                "password_changed": password_changed,
            },
        )

        return Response(_public_configuration())

    @transaction.atomic
    def delete(self, request):
        deleted, _ = MikroTikConfiguration.objects.all().delete()
        AuditLog.objects.create(
            user=request.user,
            action="mikrotik_configuration_reset_to_environment",
            entity_type="MikroTikConfiguration",
            payload={"deleted_rows": deleted},
        )
        return Response(_public_configuration())


class MikroTikConnectionTestView(APIView):
    permission_classes = [IsAdminRole]

    def post(self, request):
        serializer = MikroTikConfigurationSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        current = get_effective_mikrotik_configuration()

        test_config = EffectiveMikroTikConfiguration(
            base_url=data.get("base_url", current.base_url),
            username=data.get("username", current.username),
            password=data.get("password") or current.password,
            verify_ssl=data.get("verify_ssl", current.verify_ssl),
            hotspot_profile=data.get("hotspot_profile", current.hotspot_profile) or "paid_wifi",
            enabled=True,
            source="test",
        )

        try:
            router = MikroTikClient(test_config).test_connection()
        except MikroTikError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as exc:
            return Response(
                {"detail": f"Connexion au routeur impossible : {exc}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response({"success": True, "router": router})
