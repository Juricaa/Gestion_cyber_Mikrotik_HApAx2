from django.db import transaction

from rest_framework import permissions, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from apps.auditlog.models import AuditLog
from apps.reports.services import (
    delete_orphan_cash_reconciliation,
    sale_revenue_date,
)
from .models import FilmSale
from .serializers import FilmSaleSerializer

class FilmSaleViewSet(viewsets.ModelViewSet):
    queryset = FilmSale.objects.all()
    serializer_class = FilmSaleSerializer
    permission_classes = [permissions.IsAuthenticated]

    def perform_create(self, serializer):
        sale = serializer.save(sold_by=self.request.user)
        AuditLog.objects.create(user=self.request.user, action="film_sale_created", entity_type="FilmSale", entity_id=str(sale.id))

    def perform_destroy(self, instance):
        revenue_date = sale_revenue_date(instance)
        sale_id = instance.id
        sale_payload = {
            "title": instance.title,
            "quantity": instance.quantity,
            "total_price": str(instance.total_price),
            "revenue_date": str(revenue_date) if revenue_date else None,
        }

        with transaction.atomic():
            instance.delete()

            reconciliation_deleted = delete_orphan_cash_reconciliation(
                revenue_date,
                user=self.request.user,
                source_type="FilmSale",
                source_id=sale_id,
            )

            AuditLog.objects.create(
                user=self.request.user,
                action="film_sale_deleted",
                entity_type="FilmSale",
                entity_id=str(sale_id),
                payload={
                    **sale_payload,
                    "cash_reconciliation_deleted": reconciliation_deleted,
                },
            )

    @action(detail=False, methods=["get"], url_path="history")
    def history(self, request):
        return Response(self.get_serializer(self.get_queryset(), many=True).data)
