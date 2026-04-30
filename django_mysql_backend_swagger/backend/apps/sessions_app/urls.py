from django.urls import path
from .views import SessionViewSet


session_list = SessionViewSet.as_view({
    "get": "list",
    "post": "create",
})

session_detail = SessionViewSet.as_view({
    "get": "retrieve",
    "put": "update",
    "patch": "partial_update",
    "delete": "destroy",
})

session_active = SessionViewSet.as_view({
    "get": "active",
})

session_history = SessionViewSet.as_view({
    "get": "history",
})

session_pause = SessionViewSet.as_view({
    "post": "pause",
})

session_resume = SessionViewSet.as_view({
    "post": "resume",
})

session_finish = SessionViewSet.as_view({
    "post": "finish",
})

session_archive = SessionViewSet.as_view({
    "post": "archive",
})


urlpatterns = [
    path("", session_list, name="sessions-list"),
    path("active/", session_active, name="sessions-active"),
    path("history/", session_history, name="sessions-history"),

    path("<int:pk>/", session_detail, name="sessions-detail"),

    path("<int:pk>/pause/", session_pause, name="sessions-pause"),
    path("<int:pk>/resume/", session_resume, name="sessions-resume"),
    path("<int:pk>/finish/", session_finish, name="sessions-finish"),
    path("<int:pk>/archive/", session_archive, name="sessions-archive"),
]