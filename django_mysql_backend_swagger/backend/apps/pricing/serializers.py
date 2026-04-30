from decimal import Decimal

from rest_framework import serializers

from .models import Tariff


class TariffSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tariff
        fields = [
            "id",
            "service_type",
            "hourly_rate",
            "minimum_price",
            "active",
            "updated_at",
            "updated_by",
        ]
        read_only_fields = [
            "id",
            "updated_at",
            "updated_by",
        ]

    def validate_service_type(self, value):
        value = value.strip()

        if value in ["wifi", "console"]:
            return value

        if value.startswith("product:"):
            product_name = value.replace("product:", "").strip()

            if not product_name:
                raise serializers.ValidationError(
                    "Le nom du produit est obligatoire. Exemple: product:Film"
                )

            return f"product:{product_name}"

        raise serializers.ValidationError(
            "Type invalide. Utilise wifi, console ou product:NomProduit."
        )

    def validate(self, attrs):
        service_type = attrs.get("service_type")

        if service_type and service_type.startswith("product:"):
            attrs["hourly_rate"] = Decimal("1.00")

        return attrs

    def create(self, validated_data):
        if validated_data["service_type"].startswith("product:"):
            validated_data["hourly_rate"] = Decimal("1.00")

        return super().create(validated_data)

    def update(self, instance, validated_data):
        service_type = validated_data.get("service_type", instance.service_type)

        if service_type.startswith("product:"):
            validated_data["hourly_rate"] = Decimal("1.00")

        return super().update(instance, validated_data)