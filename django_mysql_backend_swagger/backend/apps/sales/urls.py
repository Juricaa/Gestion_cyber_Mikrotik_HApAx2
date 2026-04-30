from rest_framework.routers import DefaultRouter
from .views import FilmSaleViewSet

router = DefaultRouter()
router.register("", FilmSaleViewSet, basename="film-sales")

urlpatterns = router.urls
