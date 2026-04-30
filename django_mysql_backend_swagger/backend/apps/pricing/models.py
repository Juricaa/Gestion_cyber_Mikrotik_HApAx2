from decimal import Decimal

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import MinValueValidator
from django.db import models


class Tariff(models.Model):
    WIFI = "wifi"
    CONSOLE = "console"
    PRODUCT_PREFIX = "product:"

    service_type = models.CharField(
        max_length=100,
        db_index=True,
        help_text="Exemples: wifi, console, product:Film, product:Série",
    )

    hourly_rate = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        validators=[MinValueValidator(Decimal("0.00"))],
    )

    minimum_price = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(Decimal("0.00"))],
    )

    active = models.BooleanField(default=True)

    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )

    updated_at = models.DateTimeField(auto_now=True)

    def clean(self):
        super().clean()

        service_type = (self.service_type or "").strip()

        if service_type in [self.WIFI, self.CONSOLE]:
            return

        if service_type.startswith(self.PRODUCT_PREFIX):
            product_name = service_type.replace(self.PRODUCT_PREFIX, "").strip()

            if not product_name:
                raise ValidationError({
                    "service_type": "Le nom du produit est obligatoire. Exemple: product:Film"
                })

            self.hourly_rate = Decimal("1.00")
            return

        raise ValidationError({
            "service_type": "Type invalide. Utilise wifi, console ou product:NomProduit."
        })

    def save(self, *args, **kwargs):
        self.full_clean()

        if self.service_type.startswith(self.PRODUCT_PREFIX):
            self.hourly_rate = Decimal("1.00")

        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.service_type} - {self.hourly_rate}"