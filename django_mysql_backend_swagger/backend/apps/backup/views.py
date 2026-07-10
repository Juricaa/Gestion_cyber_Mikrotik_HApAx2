import gzip
import io
import os
import zipfile
from datetime import date, datetime, time
from decimal import Decimal
from pathlib import Path
from typing import Any

from django.conf import settings
from django.db import connection, transaction
from django.utils import timezone
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.auditlog.models import AuditLog


class BackupViewSet(viewsets.ViewSet):
    permission_classes = [permissions.IsAdminUser]
    lookup_value_regex = "[^/]+"

    def _resolve_backup_dir(self) -> Path:
        configured_dir = os.getenv("BACKUP_DIR")
        if configured_dir:
            path = Path(configured_dir)
        else:
            path = settings.BASE_DIR / "backups"
            alternate = settings.BASE_DIR.parent.parent / "backups"
            if not path.exists() and alternate.exists():
                path = alternate

        path.mkdir(parents=True, exist_ok=True)
        return path

    def _format_sql_value(self, value: Any) -> str:
        if value is None:
            return "NULL"

        if isinstance(value, bool):
            return "1" if value else "0"

        if isinstance(value, (int, float, Decimal)):
            return str(value)

        if isinstance(value, (date, datetime, time)):
            return f"'{value.isoformat(sep=' ' if isinstance(value, datetime) else ' ')}'"

        if isinstance(value, bytes):
            return f"0x{value.hex()}"

        encoded = str(value).replace("\\", "\\\\").replace("'", "\\'")
        return f"'{encoded}'"

    def _dump_sql(self, file: io.TextIOBase) -> None:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT TABLE_NAME FROM information_schema.tables "
                "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE' "
                "ORDER BY TABLE_NAME"
            )
            tables = [row[0] for row in cursor.fetchall()]

            file.write("-- Cyber Manager SQL backup\n")
            file.write(f"-- Generated: {timezone.now().isoformat()}\n")
            file.write("SET FOREIGN_KEY_CHECKS = 0;\n\n")

            for table in tables:
                cursor.execute(f"SHOW CREATE TABLE `{table}`")
                create_result = cursor.fetchone()
                create_sql = create_result[1] if create_result else ""

                file.write(f"DROP TABLE IF EXISTS `{table}`;\n")
                file.write(f"{create_sql};\n\n")

                cursor.execute(f"SELECT * FROM `{table}`")
                rows = cursor.fetchall()
                if not rows:
                    continue

                columns = [column[0] for column in cursor.description]
                column_list = ", ".join(f"`{column}`" for column in columns)

                for row in rows:
                    values = [self._format_sql_value(value) for value in row]
                    file.write(
                        f"INSERT INTO `{table}` ({column_list}) VALUES ({', '.join(values)});\n"
                    )
                file.write("\n")

            file.write("SET FOREIGN_KEY_CHECKS = 1;\n")

    def _backup_file_info(self, path: Path) -> dict[str, Any]:
        stats = path.stat()
        return {
            "filename": path.name,
            "size_bytes": stats.st_size,
            "created_at": datetime.fromtimestamp(stats.st_ctime, tz=timezone.utc).isoformat(),
            "modified_at": datetime.fromtimestamp(stats.st_mtime, tz=timezone.utc).isoformat(),
            "type": "sql.gz" if path.name.endswith(".sql.gz") else path.suffix.lstrip("."),
        }

    def _sanitize_filename(self, filename: str) -> str:
        if Path(filename).name != filename:
            raise ValueError("Nom de fichier invalide")
        return filename

    def _safe_backup_path(self, filename: str) -> Path:
        filename = self._sanitize_filename(filename)
        path = self._resolve_backup_dir() / filename
        if not path.exists() or not path.is_file():
            raise FileNotFoundError("Fichier de sauvegarde introuvable")
        if path.resolve().parent != self._resolve_backup_dir().resolve():
            raise ValueError("Chemin de sauvegarde non autorisé")
        return path

    def _read_sql_from_backup(self, path: Path) -> str:
        lower_name = path.name.lower()
        if lower_name.endswith(".zip"):
            with zipfile.ZipFile(path, "r") as archive:
                sql_entries = [name for name in archive.namelist() if name.lower().endswith(".sql")]
                if not sql_entries:
                    raise ValueError("Archive ZIP ne contient pas de fichier SQL")
                with archive.open(sql_entries[0], "r") as raw:
                    return io.TextIOWrapper(raw, encoding="utf-8").read()

        if lower_name.endswith(".sql.gz"):
            with gzip.open(path, "rt", encoding="utf-8") as raw:
                return raw.read()

        raise ValueError("Type de sauvegarde non pris en charge")

    def _split_sql_statements(self, sql: str) -> list[str]:
        statements = []
        buffer: list[str] = []
        for line in sql.splitlines(keepends=True):
            buffer.append(line)
            if line.strip().endswith(";"):
                statement = "".join(buffer).strip()
                buffer = []
                if statement and not statement.startswith("--"):
                    statements.append(statement)

        tail = "".join(buffer).strip()
        if tail:
            statements.append(tail)

        return statements

    def _perform_restoration(self, sql: str) -> None:
        with transaction.atomic():
            with connection.cursor() as cursor:
                cursor.execute("SET FOREIGN_KEY_CHECKS = 0;")
                for statement in self._split_sql_statements(sql):
                    cursor.execute(statement)
                cursor.execute("SET FOREIGN_KEY_CHECKS = 1;")

    def _create_backup(self) -> Path:
        backup_dir = self._resolve_backup_dir()
        timestamp = timezone.now().strftime("%Y%m%d_%H%M%S")
        database_name = settings.DATABASES["default"]["NAME"]
        backup_name = f"{database_name}_{timestamp}.zip"
        backup_path = backup_dir / backup_name

        with zipfile.ZipFile(backup_path, "w", zipfile.ZIP_DEFLATED) as archive:
            sql_name = f"{database_name}.sql"
            with archive.open(sql_name, "w") as raw:
                with io.TextIOWrapper(raw, encoding="utf-8") as file:
                    self._dump_sql(file)

        return backup_path

    def list(self, request, *args, **kwargs):
        backup_dir = self._resolve_backup_dir()
        backup_files = sorted(
            [path for path in backup_dir.iterdir() if path.is_file() and (path.suffix == ".zip" or path.name.endswith(".sql.gz"))],
            key=lambda path: path.stat().st_mtime,
            reverse=True,
        )

        history = (
            AuditLog.objects.filter(action__startswith="backup_")
            .order_by("-created_at")[:50]
        )

        return Response(
            {
                "backup_dir_available": backup_dir.exists() and backup_dir.is_dir(),
                "backups": [self._backup_file_info(path) for path in backup_files],
                "history": [
                    {
                        "id": log.id,
                        "user": log.user.username if log.user else None,
                        "action": log.action,
                        "entity_type": log.entity_type,
                        "entity_id": log.entity_id,
                        "payload": log.payload,
                        "created_at": log.created_at.isoformat(),
                    }
                    for log in history
                ],
            }
        )

    def create(self, request, *args, **kwargs):
        backup_path = self._create_backup()
        AuditLog.objects.create(
            user=request.user,
            action="backup_created",
            entity_type="Backup",
            entity_id=backup_path.name,
            payload={"filename": backup_path.name},
        )
        return Response(
            {
                "filename": backup_path.name,
                "size_bytes": backup_path.stat().st_size,
            },
            status=status.HTTP_201_CREATED,
        )

    @action(detail=False, methods=["post"], url_path="restore")
    def restore(self, request):
        filename = request.data.get("filename")
        if not filename:
            return Response(
                {"detail": "Le nom de fichier de sauvegarde doit être fourni."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        mode = str(request.data.get("mode", "replace"))
        if mode not in {"replace", "backup_before_restore"}:
            return Response(
                {"detail": "Mode de restauration invalide."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        backup_path = self._safe_backup_path(filename)
        pre_backup_name = None
        if mode == "backup_before_restore":
            pre_backup_path = self._create_backup()
            pre_backup_name = pre_backup_path.name
            AuditLog.objects.create(
                user=request.user,
                action="backup_before_restore_created",
                entity_type="Backup",
                entity_id=pre_backup_name,
                payload={"filename": pre_backup_name},
            )

        sql = self._read_sql_from_backup(backup_path)
        self._perform_restoration(sql)

        AuditLog.objects.create(
            user=request.user,
            action="backup_restored",
            entity_type="Backup",
            entity_id=backup_path.name,
            payload={"filename": backup_path.name, "mode": mode, "pre_backup": pre_backup_name},
        )

        return Response(
            {
                "restored": backup_path.name,
                "backup_before_restore": mode == "backup_before_restore",
                "pre_backup": pre_backup_name,
            }
        )

    def destroy(self, request, pk=None, *args, **kwargs):
        if not pk:
            return Response(
                {"detail": "Nom de fichier de sauvegarde manquant."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        backup_path = self._safe_backup_path(pk)
        backup_path.unlink()

        AuditLog.objects.create(
            user=request.user,
            action="backup_deleted",
            entity_type="Backup",
            entity_id=backup_path.name,
            payload={"filename": backup_path.name},
        )

        return Response(status=status.HTTP_204_NO_CONTENT)
