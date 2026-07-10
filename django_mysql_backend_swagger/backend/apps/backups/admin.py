from django.contrib import admin

from .models import Backup


@admin.register(Backup)
class BackupAdmin(admin.ModelAdmin):
    list_display = ("file_name", "created_at", "created_by", "status", "size")
    list_filter = ("status", "created_at")
    search_fields = ("file_name", "file_path", "notes")
    readonly_fields = ("created_at",)
    ordering = ("-created_at",)
