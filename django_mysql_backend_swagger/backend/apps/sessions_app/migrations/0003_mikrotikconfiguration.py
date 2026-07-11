from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("sessions_app", "0002_session_payment_fields"),
    ]

    operations = [
        migrations.CreateModel(
            name="MikroTikConfiguration",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("singleton_key", models.PositiveSmallIntegerField(default=1, editable=False, unique=True)),
                ("base_url", models.URLField(blank=True, max_length=255)),
                ("username", models.CharField(blank=True, max_length=128)),
                ("password_encrypted", models.TextField(blank=True)),
                ("enabled", models.BooleanField(default=False)),
                ("verify_ssl", models.BooleanField(default=False)),
                ("hotspot_profile", models.CharField(blank=True, default="paid_wifi", max_length=128)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "updated_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="updated_mikrotik_configurations",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "verbose_name": "Configuration MikroTik",
                "verbose_name_plural": "Configuration MikroTik",
            },
        ),
    ]
