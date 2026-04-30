from decimal import Decimal
from django.conf import settings
from django.db import models
from django.utils import timezone
from apps.stations.models import Station

class Session(models.Model):
    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        PAUSED = "paused", "Paused"
        COMPLETED = "completed", "Completed"
        ARCHIVED = "archived", "Archived"

    client_name = models.CharField(max_length=255, blank=True)

    voucher_code = models.CharField(max_length=30, unique=True, null=True, blank=True)
    mikrotik_username = models.CharField(max_length=64, blank=True)
    mikrotik_user_id = models.CharField(max_length=128, blank=True)
    station = models.ForeignKey(Station, on_delete=models.PROTECT, related_name="sessions")
    class SessionMode(models.TextChoices):
        OPEN = "open", "Open"
        COUNTDOWN = "countdown", "Countdown"

    service_type = models.CharField(max_length=20, default="wifi")
    session_mode = models.CharField(max_length=20, choices=SessionMode.choices, default=SessionMode.OPEN)
    countdown_seconds = models.PositiveIntegerField(default=0)
    remaining_seconds = models.PositiveIntegerField(default=0)
    started_at = models.DateTimeField(default=timezone.now)
    expected_end_at = models.DateTimeField(null=True, blank=True)
    ended_at = models.DateTimeField(null=True, blank=True)
    last_resumed_at = models.DateTimeField(null=True, blank=True)
    consumed_seconds = models.PositiveIntegerField(default=0)
    paused_duration_seconds = models.PositiveIntegerField(default=0)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.ACTIVE)
    hourly_rate_snapshot = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    minimum_price_snapshot = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    final_price = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="created_sessions")
    closed_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="closed_sessions")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def total_seconds_now(self):
        total_seconds = self.consumed_seconds
        if self.status == self.Status.ACTIVE and self.last_resumed_at:
            total_seconds += max(0, int((timezone.now() - self.last_resumed_at).total_seconds()))
        return total_seconds


    def is_countdown(self):
        return self.session_mode == self.SessionMode.COUNTDOWN

    def consume_running_time(self):
        if self.status == self.Status.ACTIVE and self.last_resumed_at:
            delta = max(0, int((timezone.now() - self.last_resumed_at).total_seconds()))
            self.consumed_seconds += delta
            if self.is_countdown():
                self.remaining_seconds = max(0, self.remaining_seconds - delta)
            self.last_resumed_at = None

    def compute_final_price(self):
        total_seconds = self.total_seconds_now()
        hours = Decimal(total_seconds) / Decimal(3600)
        price = hours * self.hourly_rate_snapshot
        if price < self.minimum_price_snapshot:
            price = self.minimum_price_snapshot
        return price.quantize(Decimal("0.01"))

class SessionEvent(models.Model):
    class EventType(models.TextChoices):
        START = "start", "Start"
        PAUSE = "pause", "Pause"
        RESUME = "resume", "Resume"
        FINISH = "finish", "Finish"
        ARCHIVE = "archive", "Archive"

    session = models.ForeignKey(Session, on_delete=models.CASCADE, related_name="events")
    event_type = models.CharField(max_length=20, choices=EventType.choices)
    timestamp = models.DateTimeField(auto_now_add=True)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)
    note = models.TextField(blank=True)
