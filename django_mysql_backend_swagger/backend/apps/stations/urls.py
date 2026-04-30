from rest_framework.routers import DefaultRouter
from .views import StationViewSet

router = DefaultRouter()
router.register("", StationViewSet, basename="stations")

urlpatterns = router.urls
