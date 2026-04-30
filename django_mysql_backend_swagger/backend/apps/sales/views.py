from rest_framework import permissions, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from apps.auditlog.models import AuditLog
from .models import FilmSale
from .serializers import FilmSaleSerializer

class FilmSaleViewSet(viewsets.ModelViewSet):
    queryset = FilmSale.objects.all()
    serializer_class = FilmSaleSerializer
    permission_classes = [permissions.IsAuthenticated]

    def perform_create(self, serializer):
        sale = serializer.save(sold_by=self.request.user)
        AuditLog.objects.create(user=self.request.user, action="film_sale_created", entity_type="FilmSale", entity_id=str(sale.id))

    @action(detail=False, methods=["get"], url_path="history")
    def history(self, request):
        return Response(self.get_serializer(self.get_queryset(), many=True).data)
