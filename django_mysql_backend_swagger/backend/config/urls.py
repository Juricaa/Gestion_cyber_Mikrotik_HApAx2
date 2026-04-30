from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularRedocView, SpectacularSwaggerView

urlpatterns = [
    path("admin/", admin.site.urls),

    # Documentation API OpenAPI / Swagger
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path("api/docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="swagger-ui"),
    path("api/redoc/", SpectacularRedocView.as_view(url_name="schema"), name="redoc"),
    path("api/auth/", include("apps.accounts.urls")),
    path("api/stations/", include("apps.stations.urls")),
    path("api/pricing/", include("apps.pricing.urls")),
    path("api/sessions/", include("apps.sessions_app.urls")),
    path("api/film-sales/", include("apps.sales.urls")),
    path("api/reports/", include("apps.reports.urls")),
]
