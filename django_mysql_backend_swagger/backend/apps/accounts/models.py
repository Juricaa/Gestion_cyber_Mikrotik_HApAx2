from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    class Role(models.TextChoices):
        ADMIN = "admin", "Admin"
        STAFF = "staff", "Staff"
        VIEWER = "viewer", "Viewer"

    full_name = models.CharField(max_length=255, blank=True)
    role = models.CharField(max_length=20, choices=Role.choices, default=Role.STAFF)

    def save(self, *args, **kwargs):
        # Quand on utilise `python manage.py createsuperuser`, Django met
        # is_superuser=True mais ne remplit pas automatiquement ton champ role.
        # Cette ligne force donc le rôle admin pour les vrais superusers.
        if self.is_superuser:
            self.role = self.Role.ADMIN
            self.is_staff = True
        super().save(*args, **kwargs)

    def __str__(self):
        return self.username
