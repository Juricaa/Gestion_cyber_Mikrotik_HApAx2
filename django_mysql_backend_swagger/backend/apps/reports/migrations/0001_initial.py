# Generated for the dashboard cash reconciliation feature.

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="DailyCashReconciliation",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("date", models.DateField(unique=True)),
                ("actual_amount", models.DecimalField(decimal_places=2, default=0, max_digits=12)),
                ("note", models.TextField(blank=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("created_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="created_cash_reconciliations", to=settings.AUTH_USER_MODEL)),
                ("updated_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="updated_cash_reconciliations", to=settings.AUTH_USER_MODEL)),
            ],
            options={
                "verbose_name": "Rapprochement de caisse journalier",
                "verbose_name_plural": "Rapprochements de caisse journaliers",
                "ordering": ["-date"],
            },
        ),
    ]
