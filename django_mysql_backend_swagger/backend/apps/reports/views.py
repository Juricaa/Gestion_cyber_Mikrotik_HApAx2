from django.db.models import Sum
from rest_framework.decorators import api_view
from rest_framework.response import Response
from apps.sales.models import FilmSale
from apps.sessions_app.models import Session

@api_view(["GET"])
def dashboard_view(request):
    active_sessions = Session.objects.filter(status__in=["active", "paused"]).count()
    completed_sessions = Session.objects.filter(status="completed").count()
    total_session_revenue = Session.objects.filter(status__in=["completed", "archived"]).aggregate(total=Sum("final_price"))["total"] or 0
    total_film_revenue = FilmSale.objects.aggregate(total=Sum("total_price"))["total"] or 0

    return Response({
        "active_sessions": active_sessions,
        "completed_sessions": completed_sessions,
        "total_session_revenue": total_session_revenue,
        "total_film_revenue": total_film_revenue,
        "total_revenue": total_session_revenue + total_film_revenue,
    })
