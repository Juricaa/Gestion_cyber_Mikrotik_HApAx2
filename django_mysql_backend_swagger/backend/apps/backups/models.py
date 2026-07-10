from django.conf import settings
from django.db import models


class Backup(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending", "En attente"
        SUCCESS = "success", "Réussite"
        FAILED = "failed", "Échec"

    file_name = models.CharField(max_length=255)
    file_path = models.CharField(max_length=1024, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="backups",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    size = models.PositiveBigIntegerField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "Backup"
        verbose_name_plural = "Backups"

    def __str__(self):
        return f"{self.file_name} ({self.created_at:%Y-%m-%d %H:%M})"
