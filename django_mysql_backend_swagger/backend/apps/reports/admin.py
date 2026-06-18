from django.contrib import admin

from .models import DailyCashReconciliation


@admin.register(DailyCashReconciliation)
class DailyCashReconciliationAdmin(admin.ModelAdmin):
    list_display = ("date", "actual_amount", "updated_by", "updated_at")
    list_filter = ("date",)
    search_fields = ("date", "note")
