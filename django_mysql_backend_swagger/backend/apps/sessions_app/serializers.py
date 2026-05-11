from django.utils import timezone
from rest_framework import serializers
from .models import Session, SessionEvent

class SessionEventSerializer(serializers.ModelSerializer):
    user_display = serializers.CharField(source="user.username", read_only=True)

    class Meta:
        model = SessionEvent
        fields = ["id", "event_type", "timestamp", "user_display", "note"]

class SessionSerializer(serializers.ModelSerializer):
    events = SessionEventSerializer(many=True, read_only=True)
    station_name = serializers.CharField(source="station.name", read_only=True)

    class Meta:
        model = Session
        fields = [
            "id",
            "client_name",
            "voucher_code",
            "mikrotik_username",
            "mikrotik_user_id",
            "station",
            "station_name",
            "service_type",
            "session_mode",
            "countdown_seconds",
            "remaining_seconds",
            "started_at",
            "last_resumed_at",
            "consumed_seconds",
            "expected_end_at",
            "ended_at",
            "paused_duration_seconds",
            "status",
            "hourly_rate_snapshot",
            "minimum_price_snapshot",
            "final_price",
            "payment_status",
            "paid_at",
            "paid_by",
            "created_by",
            "closed_by",
            "events",
        ]
        read_only_fields = [
            "voucher_code",
            "mikrotik_username",
            "mikrotik_user_id",
            "final_price",
            "payment_status",
            "paid_at",
            "paid_by",
            "created_by",
            "closed_by",
            "consumed_seconds",
            "last_resumed_at",
            "remaining_seconds",
        ]

    def to_representation(self, instance):
        """
        Donne au frontend un chrono courant, pas seulement la valeur stockée en DB.

        La DB garde consumed_seconds / remaining_seconds figés entre les actions
        pause / reprise / fin. Pour l'affichage, une session ACTIVE doit continuer
        à avancer même après refresh ou depuis un autre PC.
        """
        data = super().to_representation(instance)

        waiting_for_hotspot = bool(instance.is_waiting_for_hotspot_timer())
        current_consumed_seconds = int(instance.total_seconds_now() or 0)

        data["consumed_seconds"] = current_consumed_seconds
        data["timer_snapshot_at"] = timezone.now().isoformat()
        data["waiting_for_hotspot"] = waiting_for_hotspot
        data["timer_started"] = not waiting_for_hotspot

        if instance.session_mode == Session.SessionMode.COUNTDOWN:
            countdown_seconds = int(instance.countdown_seconds or 0)

            if instance.status == Session.Status.PAUSED:
                current_remaining_seconds = int(instance.remaining_seconds or 0)
            else:
                current_remaining_seconds = countdown_seconds - current_consumed_seconds

            data["remaining_seconds"] = max(0, current_remaining_seconds)

        return data
