from django.contrib import admin
from .models import FilmSale

@admin.register(FilmSale)
class FilmSaleAdmin(admin.ModelAdmin):
    list_display = ("title", "quantity", "unit_price", "total_price", "sold_by", "sold_at")
