from django.contrib import admin
from .models import Session, SessionEvent

class SessionEventInline(admin.TabularInline):
    model = SessionEvent
    extra = 0

@admin.register(Session)
class SessionAdmin(admin.ModelAdmin):
    list_display = ("id", "station", "client_name", "status", "started_at", "ended_at", "final_price")
    inlines = [SessionEventInline]
