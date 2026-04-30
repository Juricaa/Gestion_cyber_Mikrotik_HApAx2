from rest_framework import serializers
from .models import FilmSale

class FilmSaleSerializer(serializers.ModelSerializer):
    sold_by_username = serializers.CharField(source="sold_by.username", read_only=True)

    class Meta:
        model = FilmSale
        fields = ["id", "title", "quantity", "unit_price", "total_price", "sold_by", "sold_by_username", "sold_at"]
        read_only_fields = ["total_price", "sold_by", "sold_at"]
