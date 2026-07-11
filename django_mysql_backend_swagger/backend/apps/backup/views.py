import gzip
import io
import os
import subprocess
import tempfile
import zipfile
from datetime import date, datetime, time
from decimal import Decimal
from pathlib import Path
from typing import Any

from django.conf import settings
from django.db import connections
from django.utils import timezone
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.auditlog.models import AuditLog


class BackupCommandError(RuntimeError):
    """Erreur contrôlée lors d'une commande native MariaDB."""


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

    def _database_config(self) -> dict[str, str]:
        database = settings.DATABASES["default"]
        config = {
            "name": str(database.get("NAME") or ""),
            "user": str(database.get("USER") or ""),
            "password": str(database.get("PASSWORD") or ""),
            "host": str(database.get("HOST") or "db"),
            "port": str(database.get("PORT") or "3306"),
        }
        missing = [key for key in ("name", "user", "password") if not config[key]]
        if missing:
            raise BackupCommandError(
                "Configuration MariaDB incomplète : " + ", ".join(missing)
            )
        return config

    def _command_environment(self, password: str) -> dict[str, str]:
        environment = os.environ.copy()
        # Le mot de passe n'apparaît pas dans la ligne de commande ni dans ps.
        environment["MYSQL_PWD"] = password
        return environment

    def _command_timeout(self) -> int:
        try:
            return max(30, int(os.getenv("BACKUP_COMMAND_TIMEOUT", "300")))
        except ValueError:
            return 300

    def _dump_command(self, config: dict[str, str]) -> list[str]:
        return [
            "mariadb-dump",
            f"--host={config['host']}",
            f"--port={config['port']}",
            f"--user={config['user']}",
            "--single-transaction",
            "--quick",
            "--default-character-set=utf8mb4",
            "--hex-blob",
            "--skip-comments",
            "--skip-add-locks",
            "--skip-disable-keys",
            "--skip-set-charset",
            "--skip-tz-utc",
            "--complete-insert",
            "--extended-insert=FALSE",
            "--add-drop-table",
            config["name"],
        ]

    def _restore_command(self, config: dict[str, str]) -> list[str]:
        return [
            "mariadb",
            f"--host={config['host']}",
            f"--port={config['port']}",
            f"--user={config['user']}",
            "--default-character-set=utf8mb4",
            "--binary-mode",
            config["name"],
        ]

    def _run_native_command(
        self,
        command: list[str],
        *,
        password: str,
        stdin: io.BufferedReader | None = None,
        stdout: io.BufferedWriter | None = None,
        operation: str,
    ) -> None:
        try:
            result = subprocess.run(
                command,
                stdin=stdin,
                stdout=stdout,
                stderr=subprocess.PIPE,
                env=self._command_environment(password),
                timeout=self._command_timeout(),
                check=False,
            )
        except FileNotFoundError as exc:
            raise BackupCommandError(
                "Client MariaDB introuvable dans le conteneur backend. "
                "Reconstruisez l'image Docker du backend."
            ) from exc
        except subprocess.TimeoutExpired as exc:
            raise BackupCommandError(
                f"Délai dépassé pendant {operation}."
            ) from exc

        if result.returncode != 0:
            stderr = result.stderr.decode("utf-8", errors="replace").strip()
            raise BackupCommandError(
                f"Échec pendant {operation}: {stderr or 'erreur MariaDB inconnue'}"
            )

    def _dump_database(self, destination: Path) -> None:
        config = self._database_config()
        with destination.open("wb") as output:
            self._run_native_command(
                self._dump_command(config),
                password=config["password"],
                stdout=output,
                operation="la création de la sauvegarde",
            )

        if not destination.exists() or destination.stat().st_size == 0:
            raise BackupCommandError("Le fichier SQL généré est vide.")

    # Conservé pour les tests unitaires et la compatibilité avec les anciennes
    # sauvegardes produites par le backend avant l'unification du format.
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

    def _backup_file_info(self, path: Path) -> dict[str, Any]:
        stats = path.stat()
        is_legacy = path.name.lower().endswith(".sql.gz")
        return {
            "filename": path.name,
            "size_bytes": stats.st_size,
            "created_at": datetime.fromtimestamp(
                stats.st_ctime, tz=timezone.utc
            ).isoformat(),
            "modified_at": datetime.fromtimestamp(
                stats.st_mtime, tz=timezone.utc
            ).isoformat(),
            "type": "sql.gz (ancien)" if is_legacy else "zip",
            "format_version": "legacy" if is_legacy else "cyber-manager-v1",
        }

    def _sanitize_filename(self, filename: str) -> str:
        if Path(filename).name != filename:
            raise ValueError("Nom de fichier invalide")
        return filename

    def _safe_backup_path(self, filename: str) -> Path:
        filename = self._sanitize_filename(filename)
        backup_dir = self._resolve_backup_dir().resolve()
        path = backup_dir / filename
        if not path.exists() or not path.is_file():
            raise FileNotFoundError("Fichier de sauvegarde introuvable")
        if path.resolve().parent != backup_dir:
            raise ValueError("Chemin de sauvegarde non autorisé")
        return path

    def _max_uncompressed_size(self) -> int:
        try:
            return max(
                1_048_576,
                int(os.getenv("BACKUP_MAX_UNCOMPRESSED_BYTES", "1073741824")),
            )
        except ValueError:
            return 1_073_741_824

    def _copy_limited(self, source, destination, expected_size: int | None = None) -> None:
        limit = self._max_uncompressed_size()
        if expected_size is not None and expected_size > limit:
            raise ValueError("La sauvegarde SQL dépasse la taille maximale autorisée.")

        copied = 0
        while True:
            chunk = source.read(1024 * 1024)
            if not chunk:
                break
            copied += len(chunk)
            if copied > limit:
                raise ValueError("La sauvegarde SQL dépasse la taille maximale autorisée.")
            destination.write(chunk)

        if copied == 0:
            raise ValueError("Le fichier SQL de la sauvegarde est vide.")

    def _materialize_sql_file(self, backup_path: Path) -> Path:
        """Extrait le SQL d'un ZIP ou d'un ancien .sql.gz vers un fichier temporaire."""
        temporary = tempfile.NamedTemporaryFile(
            prefix="cyber_restore_", suffix=".sql", delete=False
        )
        temporary_path = Path(temporary.name)

        try:
            lower_name = backup_path.name.lower()
            if lower_name.endswith(".zip"):
                with zipfile.ZipFile(backup_path, "r") as archive:
                    sql_entries = [
                        item
                        for item in archive.infolist()
                        if not item.is_dir() and item.filename.lower().endswith(".sql")
                    ]
                    if len(sql_entries) != 1:
                        raise ValueError(
                            "L'archive ZIP doit contenir exactement un fichier SQL."
                        )

                    entry = sql_entries[0]
                    if Path(entry.filename).name != entry.filename:
                        raise ValueError("Chemin SQL non autorisé dans l'archive ZIP.")

                    with archive.open(entry, "r") as source:
                        self._copy_limited(
                            source,
                            temporary,
                            expected_size=entry.file_size,
                        )

            elif lower_name.endswith(".sql.gz"):
                with gzip.open(backup_path, "rb") as source:
                    self._copy_limited(source, temporary)
            else:
                raise ValueError("Type de sauvegarde non pris en charge.")

            temporary.flush()
            os.fsync(temporary.fileno())
            temporary.close()
            return temporary_path
        except Exception:
            temporary.close()
            temporary_path.unlink(missing_ok=True)
            raise

    def _restore_database(self, sql_path: Path) -> None:
        config = self._database_config()
        # Les connexions Django ouvertes avant le DROP/CREATE des tables doivent
        # être fermées afin d'éviter un état de connexion incohérent.
        connections.close_all()
        try:
            with sql_path.open("rb") as sql_input:
                self._run_native_command(
                    self._restore_command(config),
                    password=config["password"],
                    stdin=sql_input,
                    operation="la restauration de la sauvegarde",
                )
        finally:
            connections.close_all()

    def _create_backup(self) -> Path:
        backup_dir = self._resolve_backup_dir()
        timestamp = timezone.localtime().strftime("%Y%m%d_%H%M%S")
        database_name = self._database_config()["name"]
        backup_name = f"{database_name}_{timestamp}.zip"
        backup_path = backup_dir / backup_name

        pending_zip = backup_dir / f".{backup_name}.tmp"
        try:
            with tempfile.TemporaryDirectory(prefix="cyber_backup_") as temporary_dir:
                temporary_path = Path(temporary_dir)
                sql_path = temporary_path / f"{database_name}.sql"

                self._dump_database(sql_path)
                with zipfile.ZipFile(pending_zip, "w", zipfile.ZIP_DEFLATED) as archive:
                    archive.write(sql_path, arcname=f"{database_name}.sql")

                if pending_zip.stat().st_size == 0:
                    raise BackupCommandError("L'archive ZIP générée est vide.")

            # Remplacement atomique sur le volume partagé : la page web ne voit
            # jamais un ZIP partiellement écrit par le backend.
            os.replace(pending_zip, backup_path)
        finally:
            pending_zip.unlink(missing_ok=True)

        return backup_path

    def _audit_user_after_restore(self, request):
        user = getattr(request, "user", None)
        if not user or not getattr(user, "pk", None):
            return None
        try:
            return type(user).objects.filter(pk=user.pk).first()
        except Exception:
            return None

    def list(self, request, *args, **kwargs):
        backup_dir = self._resolve_backup_dir()
        backup_files = sorted(
            [
                path
                for path in backup_dir.iterdir()
                if path.is_file()
                and (
                    path.name.lower().endswith(".zip")
                    or path.name.lower().endswith(".sql.gz")
                )
            ],
            key=lambda path: path.stat().st_mtime,
            reverse=True,
        )

        history = AuditLog.objects.filter(action__startswith="backup_").order_by(
            "-created_at"
        )[:50]

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
        try:
            backup_path = self._create_backup()
        except BackupCommandError as exc:
            return Response(
                {"detail": str(exc)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

        AuditLog.objects.create(
            user=request.user,
            action="backup_created",
            entity_type="Backup",
            entity_id=backup_path.name,
            payload={"filename": backup_path.name, "format": "cyber-manager-v1"},
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

        pre_backup_name = None
        sql_path: Path | None = None
        try:
            backup_path = self._safe_backup_path(str(filename))

            if mode == "backup_before_restore":
                pre_backup_path = self._create_backup()
                pre_backup_name = pre_backup_path.name
                AuditLog.objects.create(
                    user=request.user,
                    action="backup_before_restore_created",
                    entity_type="Backup",
                    entity_id=pre_backup_name,
                    payload={
                        "filename": pre_backup_name,
                        "format": "cyber-manager-v1",
                    },
                )

            sql_path = self._materialize_sql_file(backup_path)
            self._restore_database(sql_path)
        except FileNotFoundError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_404_NOT_FOUND)
        except (ValueError, zipfile.BadZipFile, gzip.BadGzipFile, EOFError) as exc:
            return Response(
                {"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST
            )
        except BackupCommandError as exc:
            return Response(
                {"detail": str(exc)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
        finally:
            if sql_path is not None:
                sql_path.unlink(missing_ok=True)

        AuditLog.objects.create(
            user=self._audit_user_after_restore(request),
            action="backup_restored",
            entity_type="Backup",
            entity_id=backup_path.name,
            payload={
                "filename": backup_path.name,
                "mode": mode,
                "pre_backup": pre_backup_name,
            },
        )

        return Response(
            {
                "restored": backup_path.name,
                "backup_before_restore": mode == "backup_before_restore",
                "pre_backup": pre_backup_name,
                "reload_required": True,
            }
        )

    def destroy(self, request, pk=None, *args, **kwargs):
        if not pk:
            return Response(
                {"detail": "Nom de fichier de sauvegarde manquant."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            backup_path = self._safe_backup_path(pk)
        except FileNotFoundError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_404_NOT_FOUND)
        except ValueError as exc:
            return Response(
                {"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST
            )

        backup_path.unlink()

        AuditLog.objects.create(
            user=request.user,
            action="backup_deleted",
            entity_type="Backup",
            entity_id=backup_path.name,
            payload={"filename": backup_path.name},
        )

        return Response(status=status.HTTP_204_NO_CONTENT)
