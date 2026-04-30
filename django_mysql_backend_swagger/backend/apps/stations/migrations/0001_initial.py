from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True
    dependencies = []

    operations = [
        migrations.CreateModel(
            name="Station",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(max_length=100, unique=True)),
                ("station_type", models.CharField(choices=[("wifi", "Wifi"), ("console", "Console")], default="wifi", max_length=20)),
                ("status", models.CharField(choices=[("available", "Disponible"), ("occupied", "Occupé"), ("maintenance", "Maintenance")], default="available", max_length=20)),
                ("is_active", models.BooleanField(default=True)),
            ],
        ),
    ]
