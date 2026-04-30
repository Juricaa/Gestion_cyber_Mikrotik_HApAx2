from rest_framework.routers import DefaultRouter
from .views import TariffViewSet

router = DefaultRouter()
router.register("", TariffViewSet, basename="pricing")

urlpatterns = router.urls
