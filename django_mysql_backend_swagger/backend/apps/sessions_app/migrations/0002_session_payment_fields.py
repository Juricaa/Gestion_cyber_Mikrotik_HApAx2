from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("sessions_app", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="session",
            name="payment_status",
            field=models.CharField(
                choices=[("pending", "Pending"), ("paid", "Paid")],
                default="paid",
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name="session",
            name="paid_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="session",
            name="paid_by",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="paid_sessions",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AlterField(
            model_name="sessionevent",
            name="event_type",
            field=models.CharField(
                choices=[
                    ("start", "Start"),
                    ("pause", "Pause"),
                    ("resume", "Resume"),
                    ("finish", "Finish"),
                    ("archive", "Archive"),
                    ("pay", "Pay"),
                ],
                max_length=20,
            ),
        ),
    ]
