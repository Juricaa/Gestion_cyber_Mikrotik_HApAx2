from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import DailyCashReconciliationViewSet, dashboard_view

router = DefaultRouter()
router.register("cash-reconciliations", DailyCashReconciliationViewSet, basename="cash-reconciliation")

urlpatterns = [
    path("dashboard/", dashboard_view, name="dashboard"),
    path("", include(router.urls)),
]
