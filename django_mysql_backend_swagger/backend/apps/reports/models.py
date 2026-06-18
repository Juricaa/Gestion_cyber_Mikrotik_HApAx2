from django.conf import settings
from django.db import models


class DailyCashReconciliation(models.Model):
    """Montant réellement versé en caisse pour une journée.

    Ce modèle sert à comparer le total calculé par l'application web
    avec l'argent réellement reçu/versé par l'équipe.
    """

    date = models.DateField(unique=True)
    actual_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    note = models.TextField(blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_cash_reconciliations",
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="updated_cash_reconciliations",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-date"]
        verbose_name = "Rapprochement de caisse journalier"
        verbose_name_plural = "Rapprochements de caisse journaliers"

    def __str__(self):
        return f"{self.date} - {self.actual_amount} Ar"
