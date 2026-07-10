from rest_framework import viewsets

from apps.accounts.permissions import IsAdminRole
from .models import Backup
from .serializers import BackupSerializer


class BackupViewSet(viewsets.ModelViewSet):
    queryset = Backup.objects.all().order_by("-created_at")
    serializer_class = BackupSerializer
    permission_classes = [IsAdminRole]

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)
