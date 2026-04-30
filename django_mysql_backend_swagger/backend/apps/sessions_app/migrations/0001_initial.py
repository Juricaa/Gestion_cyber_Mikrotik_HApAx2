from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import django.utils.timezone


class Migration(migrations.Migration):

    initial = True
    dependencies = [
        ("stations", "0001_initial"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="Session",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("client_name", models.CharField(blank=True, max_length=255)),
                ("voucher_code", models.CharField(blank=True, max_length=30, null=True, unique=True)),
                ("mikrotik_username", models.CharField(blank=True, max_length=64)),
                ("mikrotik_user_id", models.CharField(blank=True, max_length=128)),
                ("service_type", models.CharField(default="wifi", max_length=20)),
                ("session_mode", models.CharField(choices=[("open", "Open"), ("countdown", "Countdown")], default="open", max_length=20)),
                ("countdown_seconds", models.PositiveIntegerField(default=0)),
                ("remaining_seconds", models.PositiveIntegerField(default=0)),
                ("started_at", models.DateTimeField(default=django.utils.timezone.now)),
                ("expected_end_at", models.DateTimeField(blank=True, null=True)),
                ("ended_at", models.DateTimeField(blank=True, null=True)),
                ("last_resumed_at", models.DateTimeField(blank=True, null=True)),
                ("consumed_seconds", models.PositiveIntegerField(default=0)),
                ("paused_duration_seconds", models.PositiveIntegerField(default=0)),
                ("status", models.CharField(choices=[("active", "Active"), ("paused", "Paused"), ("completed", "Completed"), ("archived", "Archived")], default="active", max_length=20)),
                ("hourly_rate_snapshot", models.DecimalField(decimal_places=2, default=0, max_digits=10)),
                ("minimum_price_snapshot", models.DecimalField(decimal_places=2, default=0, max_digits=10)),
                ("final_price", models.DecimalField(blank=True, decimal_places=2, max_digits=10, null=True)),
                ("closed_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="closed_sessions", to=settings.AUTH_USER_MODEL)),
                ("created_by", models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="created_sessions", to=settings.AUTH_USER_MODEL)),
                ("station", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="sessions", to="stations.station")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
        ),
        migrations.CreateModel(
            name="SessionEvent",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("event_type", models.CharField(choices=[("start", "Start"), ("pause", "Pause"), ("resume", "Resume"), ("finish", "Finish"), ("archive", "Archive")], max_length=20)),
                ("timestamp", models.DateTimeField(auto_now_add=True)),
                ("note", models.TextField(blank=True)),
                ("session", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="events", to="sessions_app.session")),
                ("user", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, to=settings.AUTH_USER_MODEL)),
            ],
        ),
    ]
