from datetime import datetime, time, timedelta

from django.db.models import Q
from django.utils import timezone

from apps.auditlog.models import AuditLog
from apps.sales.models import FilmSale
from apps.sessions_app.models import Session

from .models import DailyCashReconciliation


def local_revenue_date(value):
    """Convertit un horodatage de revenu vers la date locale de l'application."""
    if value is None:
        return None

    if timezone.is_aware(value):
        value = timezone.localtime(value)

    return value.date()


def session_revenue_date(session: Session):
    """Même priorité que le frontend : paiement, fin, puis début de session."""
    if session.status not in [Session.Status.COMPLETED, Session.Status.ARCHIVED]:
        return None

    return local_revenue_date(
        session.paid_at or session.ended_at or session.started_at
    )


def sale_revenue_date(sale: FilmSale):
    return local_revenue_date(sale.sold_at)


def _local_day_bounds(target_date):
    current_timezone = timezone.get_current_timezone()
    start = timezone.make_aware(
        datetime.combine(target_date, time.min),
        current_timezone,
    )
    return start, start + timedelta(days=1)


def has_app_revenue_for_date(target_date):
    """Vérifie si l'application possède encore une session ou vente ce jour-là.

    La sélection de la date d'une session reproduit exactement la logique utilisée
    dans le tableau de bord : paid_at, sinon ended_at, sinon started_at.
    """
    start, end = _local_day_bounds(target_date)

    session_timestamp_filter = (
        Q(paid_at__gte=start, paid_at__lt=end)
        | Q(
            paid_at__isnull=True,
            ended_at__gte=start,
            ended_at__lt=end,
        )
        | Q(
            paid_at__isnull=True,
            ended_at__isnull=True,
            started_at__gte=start,
            started_at__lt=end,
        )
    )

    if Session.objects.filter(
        status__in=[Session.Status.COMPLETED, Session.Status.ARCHIVED]
    ).filter(session_timestamp_filter).exists():
        return True

    return FilmSale.objects.filter(
        sold_at__gte=start,
        sold_at__lt=end,
    ).exists()


def delete_orphan_cash_reconciliation(
    target_date,
    *,
    user=None,
    source_type="",
    source_id="",
):
    """Supprime le versement réel lorsqu'aucun revenu web ne reste pour la date."""
    if target_date is None or has_app_revenue_for_date(target_date):
        return False

    reconciliation = DailyCashReconciliation.objects.filter(date=target_date).first()
    if reconciliation is None:
        return False

    reconciliation_id = reconciliation.id
    actual_amount = str(reconciliation.actual_amount)
    reconciliation.delete()

    AuditLog.objects.create(
        user=user if getattr(user, "is_authenticated", False) else None,
        action="cash_reconciliation_auto_deleted",
        entity_type="DailyCashReconciliation",
        entity_id=str(reconciliation_id),
        payload={
            "date": str(target_date),
            "actual_amount": actual_amount,
            "reason": "Aucun revenu restant dans l'application web pour cette date.",
            "source_type": source_type,
            "source_id": str(source_id or ""),
        },
    )

    return True
