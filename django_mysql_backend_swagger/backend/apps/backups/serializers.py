from rest_framework import serializers

from .models import Backup


class BackupSerializer(serializers.ModelSerializer):
    created_by = serializers.StringRelatedField(read_only=True)

    class Meta:
        model = Backup
        fields = "__all__"
        read_only_fields = ("created_by", "created_at")
