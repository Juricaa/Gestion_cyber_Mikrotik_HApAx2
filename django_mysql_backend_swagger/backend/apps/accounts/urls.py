from django.urls import path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

from . import views

urlpatterns = [
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path("api/swagger/", SpectacularSwaggerView.as_view(url_name="schema"), name="swagger-ui"),

    path("csrf/", views.csrf, name="csrf"),
    path("login/", views.login_view, name="login"),
    path("logout/", views.logout_view, name="logout"),
    path("me/", views.me_view, name="me"),

    path("users/", views.users_view, name="users"),
    path("users/create/", views.create_user_view, name="create-user"),
    path("users/<int:user_id>/", views.user_detail_view, name="user-detail"),
]
