from django.contrib import admin
from .models import MikroTikConfiguration, Session, SessionEvent

class SessionEventInline(admin.TabularInline):
    model = SessionEvent
    extra = 0

@admin.register(Session)
class SessionAdmin(admin.ModelAdmin):
    list_display = ("id", "station", "client_name", "status", "started_at", "ended_at", "final_price")
    inlines = [SessionEventInline]


@admin.register(MikroTikConfiguration)
class MikroTikConfigurationAdmin(admin.ModelAdmin):
    list_display = ("base_url", "username", "enabled", "verify_ssl", "updated_at", "updated_by")
    readonly_fields = ("password_encrypted", "updated_at")

    def has_add_permission(self, request):
        return not MikroTikConfiguration.objects.exists()
