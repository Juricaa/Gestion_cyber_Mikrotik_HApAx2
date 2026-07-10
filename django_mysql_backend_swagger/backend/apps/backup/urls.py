from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import BackupViewSet

router = DefaultRouter()
router.register("", BackupViewSet, basename="backup")

urlpatterns = [
    path("", include(router.urls)),
    path("restore/", BackupViewSet.as_view({"post": "restore"}), name="backup-restore"),
]
