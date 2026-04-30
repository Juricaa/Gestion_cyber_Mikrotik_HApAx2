from rest_framework import permissions, viewsets
from .models import Tariff
from .serializers import TariffSerializer

class TariffViewSet(viewsets.ModelViewSet):
    queryset = Tariff.objects.all().order_by("service_type", "-active")
    serializer_class = TariffSerializer
    permission_classes = [permissions.IsAuthenticated]

    def perform_create(self, serializer):
        serializer.save(updated_by=self.request.user)

    def perform_update(self, serializer):
        serializer.save(updated_by=self.request.user)
