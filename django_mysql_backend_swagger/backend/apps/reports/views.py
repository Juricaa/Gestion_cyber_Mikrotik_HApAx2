from decimal import Decimal

from django.db.models import Sum
from rest_framework import permissions, viewsets
from rest_framework.decorators import api_view
from rest_framework.response import Response

from apps.auditlog.models import AuditLog
from apps.sales.models import FilmSale
from apps.sessions_app.models import Session
from .models import DailyCashReconciliation
from .serializers import DailyCashReconciliationSerializer


@api_view(["GET"])
def dashboard_view(request):
    active_sessions = Session.objects.filter(status__in=["active", "paused"]).count()
    completed_sessions = Session.objects.filter(status="completed").count()
    total_session_revenue = Session.objects.filter(status__in=["completed", "archived"]).aggregate(total=Sum("final_price"))["total"] or Decimal("0")
    total_film_revenue = FilmSale.objects.aggregate(total=Sum("total_price"))["total"] or Decimal("0")

    return Response({
        "active_sessions": active_sessions,
        "completed_sessions": completed_sessions,
        "total_session_revenue": total_session_revenue,
        "total_film_revenue": total_film_revenue,
        "total_revenue": total_session_revenue + total_film_revenue,
    })


class DailyCashReconciliationViewSet(viewsets.ModelViewSet):
    serializer_class = DailyCashReconciliationSerializer
    permission_classes = [permissions.IsAuthenticated]
    queryset = DailyCashReconciliation.objects.all()

    def get_queryset(self):
        queryset = DailyCashReconciliation.objects.all()
        start_date = self.request.query_params.get("start_date")
        end_date = self.request.query_params.get("end_date")

        if start_date:
            queryset = queryset.filter(date__gte=start_date)

        if end_date:
            queryset = queryset.filter(date__lte=end_date)

        return queryset.order_by("-date")

    def perform_create(self, serializer):
        reconciliation = serializer.save(
            created_by=self.request.user,
            updated_by=self.request.user,
        )
        AuditLog.objects.create(
            user=self.request.user,
            action="cash_reconciliation_created",
            entity_type="DailyCashReconciliation",
            entity_id=str(reconciliation.id),
            payload={
                "date": str(reconciliation.date),
                "actual_amount": str(reconciliation.actual_amount),
            },
        )

    def perform_update(self, serializer):
        reconciliation = serializer.save(updated_by=self.request.user)
        AuditLog.objects.create(
            user=self.request.user,
            action="cash_reconciliation_updated",
            entity_type="DailyCashReconciliation",
            entity_id=str(reconciliation.id),
            payload={
                "date": str(reconciliation.date),
                "actual_amount": str(reconciliation.actual_amount),
            },
        )
