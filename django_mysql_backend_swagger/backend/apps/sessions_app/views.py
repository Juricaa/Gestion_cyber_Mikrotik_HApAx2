import json
from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from rest_framework import permissions, serializers, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.auditlog.models import AuditLog
from apps.pricing.models import Tariff
from apps.stations.models import Station

from .mikrotik import MikroTikError, get_mikrotik_client
from .models import Session, SessionEvent
from .serializers import SessionSerializer


class SessionCreateSerializer(SessionSerializer):
    class Meta(SessionSerializer.Meta):
        read_only_fields = SessionSerializer.Meta.read_only_fields


class SessionViewSet(viewsets.ModelViewSet):
    queryset = (
        Session.objects.select_related("station", "created_by", "closed_by")
        .prefetch_related("events")
        .all()
        .order_by("-created_at")
    )
    serializer_class = SessionSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_serializer_class(self):
        if self.action == "create":
            return SessionCreateSerializer
        return SessionSerializer

    def list(self, request, *args, **kwargs):
        # Polling frontend: à chaque chargement/liste, Django regarde MikroTik.
        # Si le voucher vient d'être utilisé, le chrono commence selon uptime MikroTik.
        self._sync_mikrotik_active_sessions()
        return super().list(request, *args, **kwargs)

    def retrieve(self, request, *args, **kwargs):
        self._sync_mikrotik_active_sessions(
            Session.objects.filter(pk=kwargs.get(self.lookup_url_kwarg or self.lookup_field))
        )
        return super().retrieve(request, *args, **kwargs)

    def _voucher_limit_seconds(self, session: Session):
        if (
            session.session_mode == Session.SessionMode.COUNTDOWN
            and session.countdown_seconds > 0
        ):
            # MikroTik compare limit-uptime avec le uptime total du voucher.
            # Donc il faut garder la durée totale du ticket, pas remaining_seconds.
            # Sinon après une pause/reprise, un voucher déjà utilisé peut expirer trop tôt
            # ou ne pas se comporter correctement.
            return int(session.countdown_seconds)
        return None

    def _cap_countdown_after_timeup(self, session: Session):
        if (
            session.session_mode == Session.SessionMode.COUNTDOWN
            and session.countdown_seconds > 0
            and session.remaining_seconds <= 0
        ):
            # Quand le temps est écoulé, on verrouille la durée facturée
            # à la durée prévue pour éviter que quelques secondes de retard
            # côté navigateur gonflent le montant final.
            session.remaining_seconds = 0
            session.consumed_seconds = min(
                int(session.consumed_seconds),
                int(session.countdown_seconds),
            )

    def _sync_create_wifi_voucher(self, session: Session):
        if session.service_type != "wifi":
            return

        client = get_mikrotik_client()
        code = client.generate_voucher_code()

        if not client.enabled:
            session.voucher_code = code
            session.mikrotik_username = code
            session.mikrotik_user_id = ""
            return

        created = client.create_or_enable_voucher(
            code=code,
            username=code,
            password=code,
            limit_uptime_seconds=self._voucher_limit_seconds(session),
        )

        session.voucher_code = code
        session.mikrotik_username = created["name"]
        session.mikrotik_user_id = created.get("id") or ""

    def _pause_note_from_active_users(self, active_users):
        """
        Sauvegarde l'IP/MAC du client avant de couper le Hotspot.
        Sans ça, à la reprise on réactive seulement le voucher, mais le téléphone
        ne revient pas automatiquement dans /ip hotspot active.
        """
        if not active_users:
            return ""

        active = active_users[0]
        return json.dumps(
            {
                "mikrotik_active_before_pause": {
                    "address": active.get("address"),
                    "mac_address": active.get("mac-address"),
                    "server": active.get("server"),
                }
            },
            ensure_ascii=False,
        )

    def _last_pause_login_target(self, session: Session):
        last_pause_event = (
            session.events
            .filter(event_type=SessionEvent.EventType.PAUSE)
            .order_by("-timestamp")
            .first()
        )

        if not last_pause_event or not last_pause_event.note:
            return {}

        try:
            data = json.loads(last_pause_event.note)
        except (TypeError, ValueError):
            return {}

        return data.get("mikrotik_active_before_pause") or {}

    def _sync_pause_or_finish_wifi(self, session: Session):
        if session.service_type != "wifi" or not session.mikrotik_username:
            return []

        client = get_mikrotik_client()

        if not client.enabled:
            return []

        active_users = client.find_active_users(session.mikrotik_username)

        # disable_hotspot_user désactive le voucher ET coupe la connexion active.
        # Ne pas appeler disconnect_active_user avant, sinon certains RouterOS renvoient 500.
        client.disable_hotspot_user(session.mikrotik_username)

        return active_users

    def _sync_resume_wifi(self, session: Session):
        if session.service_type != "wifi" or not session.mikrotik_username:
            return {"enabled": False, "auto_login": False}

        client = get_mikrotik_client()

        if not client.enabled:
            return {"enabled": False, "auto_login": False}

        password = session.voucher_code or session.mikrotik_username

        # IMPORTANT pour les sessions compte à rebours:
        # au resume, on recrée le voucher avec le temps RESTANT seulement.
        # Si on réutilise le même voucher, RouterOS garde son ancien uptime et
        # peut refuser/re-couper la connexion après reprise.
        if session.session_mode == Session.SessionMode.COUNTDOWN:
            if session.remaining_seconds <= 0:
                return {
                    "enabled": True,
                    "auto_login": False,
                    "message": "Temps écoulé: reprise impossible côté MikroTik.",
                }

            created = client.recreate_countdown_voucher(
                code=password,
                username=session.mikrotik_username,
                password=password,
                remaining_seconds=int(session.remaining_seconds),
                comment=f"Session Django #{session.id} - reprise countdown",
            )
        else:
            created = client.create_or_enable_voucher(
                code=password,
                username=session.mikrotik_username,
                password=password,
                limit_uptime_seconds=None,
                comment=f"Session Django #{session.id} - reprise ouverte",
            )

        session.mikrotik_user_id = created.get("id") or session.mikrotik_user_id

        target = self._last_pause_login_target(session)
        address = target.get("address")
        mac_address = target.get("mac_address")

        if not address and not mac_address:
            return {
                "enabled": True,
                "auto_login": False,
                "message": "Voucher réactivé, mais IP/MAC client non trouvé. Le client doit rouvrir le portail.",
            }

        try:
            login_result = client.login_hotspot_active_user(
                username=session.mikrotik_username,
                password=password,
                address=address,
                mac_address=mac_address,
            )
            return {
                "enabled": True,
                "auto_login": True,
                "address": address,
                "mac_address": mac_address,
                "result": login_result,
            }
        except MikroTikError as exc:
            # Non bloquant: la session Django reprend quand même.
            # On nettoie le host pour forcer une nouvelle redirection captive portal au prochain accès HTTP.
            try:
                client.remove_hotspot_hosts(address=address, mac_address=mac_address)
            except MikroTikError:
                pass

            return {
                "enabled": True,
                "auto_login": False,
                "address": address,
                "mac_address": mac_address,
                "warning": str(exc),
            }

    def _finish_session_by_timeup(self, session: Session, now):
        """
        Fin automatique quand le compte à rebours est fini.
        Cette méthode peut être appelée pendant le polling /api/sessions/.
        """
        if session.status != Session.Status.ACTIVE:
            return

        session.consumed_seconds = int(session.countdown_seconds or 0)
        session.remaining_seconds = 0
        session.last_resumed_at = None
        session.ended_at = now
        session.status = Session.Status.COMPLETED
        session.final_price = session.compute_final_price()

        try:
            self._sync_pause_or_finish_wifi(session)
        except Exception as exc:
            # Le routeur peut déjà avoir coupé le voucher par limit-uptime.
            print(f"[MikroTik warning] auto timeup session {session.id}: {exc}")

        session.save(
            update_fields=[
                "consumed_seconds",
                "remaining_seconds",
                "last_resumed_at",
                "ended_at",
                "status",
                "final_price",
                "updated_at",
            ]
        )

        station = session.station
        station.status = Station.Status.AVAILABLE
        station.save(update_fields=["status"])

        SessionEvent.objects.create(
            session=session,
            event_type=SessionEvent.EventType.FINISH,
            user=None,
            note="Fin automatique: compte à rebours terminé.",
        )

        AuditLog.objects.create(
            user=None,
            action="session_finished_by_timeup",
            entity_type="Session",
            entity_id=str(session.id),
            payload={
                "final_price": str(session.final_price),
                "consumed_seconds": session.consumed_seconds,
                "remaining_seconds": session.remaining_seconds,
            },
        )

    def _sync_mikrotik_active_sessions(self, queryset=None):
        """
        Démarre le chrono/compte à rebours seulement quand MikroTik confirme que
        le voucher est réellement utilisé dans /ip/hotspot/active.

        Exemple:
        - session créée à 08:15:00
        - client utilise le code à 08:17:00
        - Django détecte à 08:17:45 avec uptime MikroTik = 45s
        => started_at et last_resumed_at deviennent 08:17:00.
        """
        base_queryset = queryset or Session.objects.filter(
            service_type="wifi",
            status=Session.Status.ACTIVE,
        )

        sessions = list(
            base_queryset
            .select_related("station")
            .filter(service_type="wifi", status=Session.Status.ACTIVE)
            .exclude(mikrotik_username="")
        )

        if not sessions:
            return

        client = get_mikrotik_client()

        if not client.enabled:
            return

        try:
            active_users = client.list_active_users()
        except MikroTikError as exc:
            print(f"[MikroTik warning] sync active sessions: {exc}")
            return

        active_by_username = {}
        for active in active_users:
            username = active.get("user")
            if username:
                active_by_username.setdefault(username, active)

        now = timezone.now()

        for session in sessions:
            active = active_by_username.get(session.mikrotik_username)

            if not active:
                continue

            uptime_seconds = max(0, int(client.active_uptime_seconds(active)))

            # Cas principal: session créée, voucher encore jamais utilisé.
            # Le timer Django ne commence pas à la création, il commence à l'uptime MikroTik.
            if session.last_resumed_at is None and int(session.consumed_seconds or 0) == 0:
                activation_time = now - timedelta(seconds=uptime_seconds)
                session.started_at = activation_time
                session.last_resumed_at = activation_time

                update_fields = ["started_at", "last_resumed_at", "updated_at"]

                if session.session_mode == Session.SessionMode.COUNTDOWN:
                    session.remaining_seconds = max(
                        0,
                        int(session.countdown_seconds or 0) - uptime_seconds,
                    )
                    session.expected_end_at = (
                        activation_time + timedelta(seconds=int(session.countdown_seconds or 0))
                        if session.countdown_seconds
                        else None
                    )
                    update_fields += ["remaining_seconds", "expected_end_at"]

                session.save(update_fields=update_fields)

                AuditLog.objects.create(
                    user=None,
                    action="session_hotspot_activated",
                    entity_type="Session",
                    entity_id=str(session.id),
                    payload={
                        "voucher_code": session.voucher_code,
                        "mikrotik_username": session.mikrotik_username,
                        "mikrotik_uptime_seconds": uptime_seconds,
                        "client_address": active.get("address"),
                        "client_mac": active.get("mac-address"),
                    },
                )

            # Après synchronisation, si le countdown est déjà terminé,
            # on coupe la connexion et on ferme la session.
            if (
                session.session_mode == Session.SessionMode.COUNTDOWN
                and int(session.countdown_seconds or 0) > 0
                and int(session.total_seconds_now() or 0) >= int(session.countdown_seconds or 0)
            ):
                self._finish_session_by_timeup(session, now)

    def perform_create(self, serializer):
        station = serializer.validated_data["station"]

        if station.status != Station.Status.AVAILABLE:
            raise serializers.ValidationError({
                "station": "Le poste n'est pas disponible"
            })

        service_type = serializer.validated_data.get("service_type", "wifi")

        tariff = Tariff.objects.filter(
            service_type=service_type,
            active=True,
        ).first()

        hourly_rate = tariff.hourly_rate if tariff else 0
        minimum_price = tariff.minimum_price if tariff else 0

        with transaction.atomic():
            countdown_seconds = serializer.validated_data.get("countdown_seconds", 0)
            session_mode = serializer.validated_data.get(
                "session_mode",
                Session.SessionMode.OPEN,
            )

            remaining_seconds = (
                countdown_seconds
                if session_mode == Session.SessionMode.COUNTDOWN
                else 0
            )

            now = timezone.now()
            timer_starts_now = service_type != "wifi"

            session = serializer.save(
                created_by=self.request.user,
                hourly_rate_snapshot=hourly_rate,
                minimum_price_snapshot=minimum_price,
                # WiFi : le chrono démarre quand MikroTik confirme le voucher actif.
                # Console : le chrono démarre immédiatement à la création.
                started_at=now,
                last_resumed_at=now if timer_starts_now else None,
                remaining_seconds=remaining_seconds,
                expected_end_at=(
                    now + timedelta(seconds=int(countdown_seconds or 0))
                    if timer_starts_now
                    and session_mode == Session.SessionMode.COUNTDOWN
                    and countdown_seconds
                    else None
                ),
            )

            try:
                self._sync_create_wifi_voucher(session)
            except MikroTikError as exc:
                raise serializers.ValidationError({"mikrotik": str(exc)})

            session.save()

            station.status = Station.Status.OCCUPIED
            station.save(update_fields=["status"])

            SessionEvent.objects.create(
                session=session,
                event_type=SessionEvent.EventType.START,
                user=self.request.user,
                note=(
                    "Voucher créé. Le chrono démarre quand le client utilise le code sur le portail Hotspot."
                    if service_type == "wifi"
                    else "Session console démarrée immédiatement."
                ),
            )

            AuditLog.objects.create(
                user=self.request.user,
                action="session_started",
                entity_type="Session",
                entity_id=str(session.id),
                payload={
                    "voucher_code": session.voucher_code,
                    "service_type": session.service_type,
                    "session_mode": session.session_mode,
                    "remaining_seconds": session.remaining_seconds,
                },
            )

    @action(detail=False, methods=["get"], url_path="active")
    def active(self, request):
        queryset = self.get_queryset().filter(
            status__in=[
                Session.Status.ACTIVE,
                Session.Status.PAUSED,
            ]
        )

        self._sync_mikrotik_active_sessions(
            queryset.filter(status=Session.Status.ACTIVE)
        )

        # Refetch après synchronisation: une session countdown peut être
        # automatiquement terminée si le temps est écoulé.
        queryset = self.get_queryset().filter(
            status__in=[
                Session.Status.ACTIVE,
                Session.Status.PAUSED,
            ]
        )

        return Response(self.get_serializer(queryset, many=True).data)

    @action(detail=False, methods=["get"], url_path="history")
    def history(self, request):
        queryset = self.get_queryset().filter(
            status__in=[
                Session.Status.COMPLETED,
                Session.Status.ARCHIVED,
            ]
        )

        return Response(self.get_serializer(queryset, many=True).data)

    @action(detail=True, methods=["post"], url_path="pause")
    def pause(self, request, pk=None):
        session = self.get_object()

        self._sync_mikrotik_active_sessions(Session.objects.filter(pk=session.pk))
        session.refresh_from_db()

        if session.status != Session.Status.ACTIVE:
            raise serializers.ValidationError({
                "status": "Seule une session active peut être mise en pause"
            })

        # Figer le temps consommé jusqu'au moment de la pause
        session.consume_running_time()
        session.status = Session.Status.PAUSED

        try:
            mikrotik_active_before_pause = self._sync_pause_or_finish_wifi(session)
        except MikroTikError as exc:
            raise serializers.ValidationError({"mikrotik": str(exc)})

        session.save(
            update_fields=[
                "consumed_seconds",
                "remaining_seconds",
                "last_resumed_at",
                "status",
                "updated_at",
            ]
        )

        SessionEvent.objects.create(
            session=session,
            event_type=SessionEvent.EventType.PAUSE,
            user=request.user,
            note=self._pause_note_from_active_users(mikrotik_active_before_pause),
        )

        AuditLog.objects.create(
            user=request.user,
            action="session_paused",
            entity_type="Session",
            entity_id=str(session.id),
            payload={
                "consumed_seconds": session.consumed_seconds,
                "remaining_seconds": session.remaining_seconds,
                "paused_duration_seconds": session.paused_duration_seconds,
            },
        )

        return Response(self.get_serializer(session).data)

    @action(detail=True, methods=["post"], url_path="resume")
    def resume(self, request, pk=None):
        session = self.get_object()

        if session.status != Session.Status.PAUSED:
            raise serializers.ValidationError({
                "status": "Seule une session en pause peut être reprise"
            })

        if (
            session.session_mode == Session.SessionMode.COUNTDOWN
            and session.remaining_seconds <= 0
        ):
            raise serializers.ValidationError({
                "countdown": "Temps écoulé, impossible de reprendre"
            })

        now = timezone.now()

        last_pause_event = (
            session.events
            .filter(event_type=SessionEvent.EventType.PAUSE)
            .order_by("-timestamp")
            .first()
        )

        pause_duration_seconds = 0

        if last_pause_event:
            pause_duration_seconds = max(
                0,
                int((now - last_pause_event.timestamp).total_seconds()),
            )

        session.paused_duration_seconds = (
            session.paused_duration_seconds or 0
        ) + pause_duration_seconds

        try:
            mikrotik_resume_result = self._sync_resume_wifi(session)
        except MikroTikError as exc:
            raise serializers.ValidationError({"mikrotik": str(exc)})

        session.status = Session.Status.ACTIVE
        session.last_resumed_at = now

        session.save(
            update_fields=[
                "status",
                "last_resumed_at",
                "paused_duration_seconds",
                "mikrotik_user_id",
                "updated_at",
            ]
        )

        SessionEvent.objects.create(
            session=session,
            event_type=SessionEvent.EventType.RESUME,
            user=request.user,
            note=f"Pause durée: {pause_duration_seconds} secondes",
        )

        AuditLog.objects.create(
            user=request.user,
            action="session_resumed",
            entity_type="Session",
            entity_id=str(session.id),
            payload={
                "pause_duration_seconds": pause_duration_seconds,
                "paused_duration_seconds": session.paused_duration_seconds,
                "remaining_seconds": session.remaining_seconds,
                "mikrotik": mikrotik_resume_result,
            },
        )

        return Response({
            "session": self.get_serializer(session).data,
            "pause_duration_seconds": pause_duration_seconds,
            "paused_duration_seconds": session.paused_duration_seconds,
            "mikrotik": mikrotik_resume_result,
        })

    @action(detail=True, methods=["post"], url_path="finish")
    def finish(self, request, pk=None):
        session = self.get_object()

        self._sync_mikrotik_active_sessions(Session.objects.filter(pk=session.pk))
        session.refresh_from_db()

        if session.status in [Session.Status.COMPLETED, Session.Status.ARCHIVED]:
            return Response(self.get_serializer(session).data)

        now = timezone.now()

        if session.status == Session.Status.ACTIVE:
            session.consume_running_time()
            self._cap_countdown_after_timeup(session)

        # Si on termine pendant une pause, calculer aussi cette pause
        if session.status == Session.Status.PAUSED:
            last_pause_event = (
                session.events
                .filter(event_type=SessionEvent.EventType.PAUSE)
                .order_by("-timestamp")
                .first()
            )

            pause_duration_seconds = 0

            if last_pause_event:
                pause_duration_seconds = max(
                    0,
                    int((now - last_pause_event.timestamp).total_seconds()),
                )

            session.paused_duration_seconds = (
                session.paused_duration_seconds or 0
            ) + pause_duration_seconds

        try:
            self._sync_pause_or_finish_wifi(session)
        except Exception as exc:
            # La session Django ne doit pas rester bloquée si MikroTik renvoie 500.
            # Le routeur peut déjà avoir supprimé l'utilisateur actif ou refuser un remove.
            print(f"[MikroTik warning] finish session {session.id}: {exc}")

        session.ended_at = now
        session.last_resumed_at = None
        session.status = Session.Status.COMPLETED
        session.closed_by = request.user
        session.final_price = session.compute_final_price()

        session.save(
            update_fields=[
                "consumed_seconds",
                "paused_duration_seconds",
                "ended_at",
                "last_resumed_at",
                "remaining_seconds",
                "status",
                "closed_by",
                "final_price",
                "updated_at",
            ]
        )

        station = session.station
        station.status = Station.Status.AVAILABLE
        station.save(update_fields=["status"])

        SessionEvent.objects.create(
            session=session,
            event_type=SessionEvent.EventType.FINISH,
            user=request.user,
        )

        AuditLog.objects.create(
            user=request.user,
            action="session_finished",
            entity_type="Session",
            entity_id=str(session.id),
            payload={
                "final_price": str(session.final_price),
                "consumed_seconds": session.consumed_seconds,
                "remaining_seconds": session.remaining_seconds,
                "paused_duration_seconds": session.paused_duration_seconds,
            },
        )

        return Response(self.get_serializer(session).data)

    @action(detail=True, methods=["post"], url_path="archive")
    def archive(self, request, pk=None):
        session = self.get_object()

        if session.status == Session.Status.ARCHIVED:
            return Response(self.get_serializer(session).data)

        if session.status != Session.Status.COMPLETED:
            raise serializers.ValidationError({
                "status": "Termine d'abord la session avant archivage"
            })

        session.status = Session.Status.ARCHIVED
        session.save(update_fields=["status", "updated_at"])

        SessionEvent.objects.create(
            session=session,
            event_type=SessionEvent.EventType.ARCHIVE,
            user=request.user,
        )

        AuditLog.objects.create(
            user=request.user,
            action="session_archived",
            entity_type="Session",
            entity_id=str(session.id),
        )

        return Response(self.get_serializer(session).data)