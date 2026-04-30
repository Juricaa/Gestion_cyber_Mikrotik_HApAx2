from rest_framework import permissions, viewsets
from .models import Station
from .serializers import StationSerializer

class StationViewSet(viewsets.ModelViewSet):
    queryset = Station.objects.all().order_by("name")
    serializer_class = StationSerializer
    permission_classes = [permissions.IsAuthenticated]
