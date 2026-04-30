from django.contrib import admin
from .models import Tariff

@admin.register(Tariff)
class TariffAdmin(admin.ModelAdmin):
    list_display = ("service_type", "hourly_rate", "minimum_price", "active", "updated_at")
