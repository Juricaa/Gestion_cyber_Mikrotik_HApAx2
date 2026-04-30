from django.db import models

class Station(models.Model):
    class Type(models.TextChoices):
        WIFI = "wifi", "Wifi"
        CONSOLE = "console", "Console"

    class Status(models.TextChoices):
        AVAILABLE = "available", "Disponible"
        OCCUPIED = "occupied", "Occupé"
        MAINTENANCE = "maintenance", "Maintenance"

    name = models.CharField(max_length=100, unique=True)
    station_type = models.CharField(max_length=20, choices=Type.choices, default=Type.WIFI)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.AVAILABLE)
    is_active = models.BooleanField(default=True)

    def __str__(self):
        return self.name
