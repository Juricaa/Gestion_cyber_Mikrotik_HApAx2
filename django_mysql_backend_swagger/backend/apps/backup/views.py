import gzip
import io
import os
import re
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

from apps.accounts.permissions import IsAdminRole
from apps.auditlog.models import AuditLog


class BackupCommandError(RuntimeError):
    """Erreur contrôlée lors d'une commande native MariaDB."""


class BackupViewSet(viewsets.ViewSet):
    # La consultation et les sauvegardes métier sont disponibles à tout
    # utilisateur connecté. Les opérations complètes restent réservées à
    # l'administrateur car elles incluent comptes, secrets et configuration.
    permission_classes = [permissions.IsAuthenticated]
    lookup_value_regex = "[^/]+"

    ADMIN_ONLY_ACTIONS = {"create", "restore", "destroy", "import_business"}
    BUSINESS_BACKUP_MARKER = "_business_"

    BUSINESS_TABLE_ORDER = (
        "stations_station",
        "pricing_tariff",
        "sessions_app_session",
        "sessions_app_sessionevent",
        "sales_filmsale",
    )
    BUSINESS_DELETE_ORDER = (
        "sessions_app_sessionevent",
        "sales_filmsale",
        "reports_dailycashreconciliation",
        "sessions_app_session",
        "pricing_tariff",
        "stations_station",
    )
    BUSINESS_USER_COLUMNS = {
        "pricing_tariff": ("updated_by_id",),
        "sessions_app_session": ("closed_by_id", "created_by_id", "paid_by_id"),
        "sessions_app_sessionevent": ("user_id",),
        "sales_filmsale": ("sold_by_id",),
    }

    def get_permissions(self):
        permission_classes = (
            [IsAdminRole]
            if getattr(self, "action", None) in self.ADMIN_ONLY_ACTIONS
            else [permissions.IsAuthenticated]
        )
        return [permission() for permission in permission_classes]

    def _is_admin(self, user) -> bool:
        return bool(
            user
            and getattr(user, "is_authenticated", False)
            and (
                getattr(user, "role", None) == "admin"
                or getattr(user, "is_superuser", False)
            )
        )

    def _is_business_backup_name(self, filename: str) -> bool:
        return self.BUSINESS_BACKUP_MARKER in filename.lower()

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

    def _dump_business_database(self, destination: Path) -> None:
        config = self._database_config()
        command = self._dump_command(config) + list(self.BUSINESS_TABLE_ORDER)
        with destination.open("wb") as output:
            self._run_native_command(
                command,
                password=config["password"],
                stdout=output,
                operation="la création de la sauvegarde métier",
            )

        if not destination.exists() or destination.stat().st_size == 0:
            raise BackupCommandError("Le fichier SQL métier généré est vide.")

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
        is_business = self._is_business_backup_name(path.name)
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
            "scope": "business" if is_business else "full",
            "format_version": (
                "legacy"
                if is_legacy
                else "cyber-manager-business-v1"
                if is_business
                else "cyber-manager-v1"
            ),
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
            elif lower_name.endswith(".sql"):
                with backup_path.open("rb") as source:
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

    def _max_business_upload_size(self) -> int:
        try:
            return max(
                1_048_576,
                int(os.getenv("BUSINESS_IMPORT_MAX_UPLOAD_BYTES", "104857600")),
            )
        except ValueError:
            return 104_857_600

    def _save_uploaded_backup(self, uploaded_file) -> Path:
        original_name = Path(str(getattr(uploaded_file, "name", ""))).name
        lower_name = original_name.lower()
        if lower_name.endswith(".sql.gz"):
            suffix = ".sql.gz"
        elif lower_name.endswith(".zip"):
            suffix = ".zip"
        elif lower_name.endswith(".sql"):
            suffix = ".sql"
        else:
            raise ValueError("Formats acceptés : .zip, .sql.gz ou .sql.")

        declared_size = int(getattr(uploaded_file, "size", 0) or 0)
        limit = self._max_business_upload_size()
        if declared_size > limit:
            raise ValueError("Le fichier importé dépasse la taille maximale autorisée.")

        temporary = tempfile.NamedTemporaryFile(
            prefix="cyber_business_upload_", suffix=suffix, delete=False
        )
        temporary_path = Path(temporary.name)
        written = 0
        try:
            chunks = getattr(uploaded_file, "chunks", None)
            iterator = chunks() if callable(chunks) else iter(lambda: uploaded_file.read(1024 * 1024), b"")
            for chunk in iterator:
                if not chunk:
                    continue
                written += len(chunk)
                if written > limit:
                    raise ValueError("Le fichier importé dépasse la taille maximale autorisée.")
                temporary.write(chunk)

            if written == 0:
                raise ValueError("Le fichier importé est vide.")

            temporary.flush()
            os.fsync(temporary.fileno())
            temporary.close()
            return temporary_path
        except Exception:
            temporary.close()
            temporary_path.unlink(missing_ok=True)
            raise

    def _iter_sql_statements(self, sql_text: str):
        """Découpe un dump SQL sans casser les chaînes contenant des points-virgules."""
        current: list[str] = []
        quote: str | None = None
        escaped = False
        line_comment = False
        block_comment = False
        index = 0
        length = len(sql_text)

        while index < length:
            char = sql_text[index]
            next_char = sql_text[index + 1] if index + 1 < length else ""
            next_next = sql_text[index + 2] if index + 2 < length else ""

            if line_comment:
                if char in "\r\n":
                    line_comment = False
                    current.append("\n")
                index += 1
                continue

            if block_comment:
                if char == "*" and next_char == "/":
                    block_comment = False
                    index += 2
                else:
                    index += 1
                continue

            if quote is not None:
                current.append(char)
                if escaped:
                    escaped = False
                elif char == "\\" and quote in {"'", '"'}:
                    escaped = True
                elif char == quote:
                    # MariaDB accepte aussi l'échappement SQL par double quote.
                    if next_char == quote:
                        current.append(next_char)
                        index += 2
                        continue
                    quote = None
                index += 1
                continue

            if char == "-" and next_char == "-" and (not next_next or next_next.isspace()):
                line_comment = True
                index += 2
                continue
            if char == "#":
                line_comment = True
                index += 1
                continue
            if char == "/" and next_char == "*":
                block_comment = True
                index += 2
                continue
            if char in {"'", '"', "`"}:
                quote = char
                current.append(char)
                index += 1
                continue
            if char == ";":
                current.append(char)
                statement = "".join(current).strip()
                if statement:
                    yield statement
                current = []
                index += 1
                continue

            current.append(char)
            index += 1

        remainder = "".join(current).strip()
        if remainder:
            yield remainder

    def _target_table_columns(self, table_name: str) -> list[str]:
        connection = connections["default"]
        with connection.cursor() as cursor:
            description = connection.introspection.get_table_description(
                cursor, table_name
            )
        return [column.name for column in description]

    def _is_literal_sql_value(self, token: str) -> bool:
        value = token.strip()
        if not value:
            return False

        upper = value.upper()
        if upper in {"NULL", "TRUE", "FALSE"}:
            return True
        if re.fullmatch(r"[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?", value):
            return True
        if re.fullmatch(r"0x[0-9A-Fa-f]+", value):
            return True
        if re.fullmatch(r"[bBxX]'[0-9A-Fa-f]*'", value, flags=re.DOTALL):
            return True
        if value[0] in {"'", '"'} and value[-1] == value[0]:
            return True
        if re.fullmatch(r"_[A-Za-z0-9]+\s*(['\"]).*\1", value, flags=re.DOTALL):
            return True
        return False

    def _validate_values_rows(self, values_sql: str) -> tuple[int, int]:
        text = values_sql.strip()
        if text.endswith(";"):
            text = text[:-1].rstrip()

        index = 0
        row_count = 0
        expected_value_count: int | None = None
        length = len(text)

        def skip_spaces(position: int) -> int:
            while position < length and text[position].isspace():
                position += 1
            return position

        while True:
            index = skip_spaces(index)
            if index >= length:
                break
            if text[index] != "(":
                raise ValueError("Structure VALUES invalide dans la sauvegarde.")
            index += 1

            values: list[str] = []
            token: list[str] = []
            quote: str | None = None
            escaped = False

            while index < length:
                char = text[index]
                next_char = text[index + 1] if index + 1 < length else ""

                if quote is not None:
                    token.append(char)
                    if escaped:
                        escaped = False
                    elif char == "\\" and quote in {"'", '"'}:
                        escaped = True
                    elif char == quote:
                        if next_char == quote:
                            token.append(next_char)
                            index += 2
                            continue
                        quote = None
                    index += 1
                    continue

                if char in {"'", '"'}:
                    quote = char
                    token.append(char)
                    index += 1
                    continue
                if char == "(":
                    raise ValueError("Expression SQL non littérale refusée dans VALUES.")
                if char == ",":
                    candidate = "".join(token).strip()
                    if not self._is_literal_sql_value(candidate):
                        raise ValueError("Valeur SQL non littérale refusée dans la sauvegarde.")
                    values.append(candidate)
                    token = []
                    index += 1
                    continue
                if char == ")":
                    candidate = "".join(token).strip()
                    if not self._is_literal_sql_value(candidate):
                        raise ValueError("Valeur SQL non littérale refusée dans la sauvegarde.")
                    values.append(candidate)
                    index += 1
                    break

                token.append(char)
                index += 1
            else:
                raise ValueError("Parenthèse VALUES non fermée.")

            if expected_value_count is None:
                expected_value_count = len(values)
            elif len(values) != expected_value_count:
                raise ValueError("Nombre de valeurs incohérent entre les lignes SQL.")

            row_count += 1
            index = skip_spaces(index)
            if index >= length:
                break
            if text[index] != ",":
                raise ValueError("Séparateur invalide entre les lignes VALUES.")
            index += 1

        if row_count == 0 or expected_value_count is None:
            raise ValueError("Aucune ligne de données trouvée dans INSERT.")
        return row_count, expected_value_count

    def _normalize_business_insert(
        self,
        statement: str,
        table_columns: dict[str, list[str]],
    ) -> tuple[str, str, int] | None:
        match = re.match(
            r"^\s*INSERT\s+INTO\s+`?(?P<table>[A-Za-z0-9_]+)`?\s*"
            r"(?P<columns>\([^)]*\))?\s+VALUES\s*(?P<values>.*)\s*$",
            statement,
            flags=re.IGNORECASE | re.DOTALL,
        )
        if not match:
            return None

        table_name = match.group("table")
        if table_name not in self.BUSINESS_TABLE_ORDER:
            return None

        target_columns = table_columns[table_name]
        columns_group = match.group("columns")
        if columns_group:
            source_columns = [
                column.strip().strip("`")
                for column in columns_group[1:-1].split(",")
                if column.strip()
            ]
            if not source_columns or any(
                not re.fullmatch(r"[A-Za-z0-9_]+", column)
                for column in source_columns
            ):
                raise ValueError(f"Liste de colonnes invalide pour {table_name}.")
            unknown = [column for column in source_columns if column not in target_columns]
            if unknown:
                raise ValueError(
                    f"Colonnes incompatibles dans {table_name}: {', '.join(unknown)}"
                )
        else:
            source_columns = target_columns
            columns_group = "(" + ", ".join(f"`{column}`" for column in source_columns) + ")"

        values_sql = match.group("values").strip()
        row_count, value_count = self._validate_values_rows(values_sql)
        if value_count != len(source_columns):
            raise ValueError(
                f"Le nombre de valeurs de {table_name} ({value_count}) ne correspond "
                f"pas au nombre de colonnes ({len(source_columns)})."
            )

        normalized = (
            f"INSERT INTO `{table_name}` {columns_group} VALUES {values_sql.rstrip(';')};"
        )
        return table_name, normalized, row_count

    def _build_business_restore_sql(self, source_sql_path: Path) -> tuple[Path, dict[str, int]]:
        sql_text = source_sql_path.read_text(encoding="utf-8", errors="replace")
        table_columns = {
            table_name: self._target_table_columns(table_name)
            for table_name in self.BUSINESS_TABLE_ORDER
        }
        statements: dict[str, list[str]] = {
            table_name: [] for table_name in self.BUSINESS_TABLE_ORDER
        }
        counts = {table_name: 0 for table_name in self.BUSINESS_TABLE_ORDER}

        for statement in self._iter_sql_statements(sql_text):
            normalized = self._normalize_business_insert(statement, table_columns)
            if normalized is None:
                continue
            table_name, safe_statement, row_count = normalized
            statements[table_name].append(safe_statement)
            counts[table_name] += row_count

        if not any(counts.values()):
            raise ValueError(
                "La sauvegarde ne contient aucune donnée métier compatible. "
                "Utilisez une sauvegarde Cyber Manager du même projet."
            )

        temporary = tempfile.NamedTemporaryFile(
            prefix="cyber_business_restore_", suffix=".sql", delete=False, mode="w", encoding="utf-8"
        )
        temporary_path = Path(temporary.name)
        try:
            temporary.write("SET NAMES utf8mb4;\n")
            temporary.write("SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS;\n")
            temporary.write("SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS;\n")
            temporary.write("SET FOREIGN_KEY_CHECKS=0;\nSET UNIQUE_CHECKS=0;\n")
            temporary.write("START TRANSACTION;\n")

            for table_name in self.BUSINESS_DELETE_ORDER:
                temporary.write(f"DELETE FROM `{table_name}`;\n")

            for table_name in self.BUSINESS_TABLE_ORDER:
                for statement in statements[table_name]:
                    temporary.write(statement)
                    temporary.write("\n")

            # Les IDs des opérateurs appartiennent à l'ancien PC. Ils sont
            # volontairement dissociés pour conserver les comptes de la cible.
            for table_name, columns in self.BUSINESS_USER_COLUMNS.items():
                assignments = ", ".join(f"`{column}`=NULL" for column in columns)
                temporary.write(f"UPDATE `{table_name}` SET {assignments};\n")

            temporary.write("COMMIT;\n")
            temporary.write("SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS;\n")
            temporary.write("SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS;\n")
            temporary.flush()
            os.fsync(temporary.fileno())
            temporary.close()
            return temporary_path, counts
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

    def _create_business_backup(self) -> Path:
        backup_dir = self._resolve_backup_dir()
        timestamp = timezone.localtime().strftime("%Y%m%d_%H%M%S")
        database_name = self._database_config()["name"]
        backup_name = f"{database_name}_business_{timestamp}.zip"
        backup_path = backup_dir / backup_name
        pending_zip = backup_dir / f".{backup_name}.tmp"

        try:
            with tempfile.TemporaryDirectory(prefix="cyber_business_backup_") as temporary_dir:
                temporary_path = Path(temporary_dir)
                sql_name = f"{database_name}_business.sql"
                sql_path = temporary_path / sql_name

                self._dump_business_database(sql_path)
                with zipfile.ZipFile(pending_zip, "w", zipfile.ZIP_DEFLATED) as archive:
                    archive.write(sql_path, arcname=sql_name)

                if pending_zip.stat().st_size == 0:
                    raise BackupCommandError("L'archive ZIP métier générée est vide.")

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
                and (
                    self._is_admin(request.user)
                    or self._is_business_backup_name(path.name)
                )
            ],
            key=lambda path: path.stat().st_mtime,
            reverse=True,
        )

        history_query = AuditLog.objects.filter(
            action__in=(
                "backup_created",
                "backup_deleted",
                "backup_restored",
                "backup_before_restore_created",
                "business_backup_created",
                "business_backup_restored",
                "business_data_imported",
            )
        )
        if not self._is_admin(request.user):
            history_query = history_query.filter(
                action__in=("business_backup_created", "business_backup_restored")
            )
        history = history_query.order_by("-created_at")[:50]

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

    def create_business(self, request, *args, **kwargs):
        """Crée une sauvegarde sans comptes ni configuration sensible."""
        try:
            backup_path = self._create_business_backup()
        except BackupCommandError as exc:
            return Response(
                {"detail": str(exc)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

        AuditLog.objects.create(
            user=request.user,
            action="business_backup_created",
            entity_type="Backup",
            entity_id=backup_path.name,
            payload={
                "filename": backup_path.name,
                "format": "cyber-manager-business-v1",
                "accounts_included": False,
                "mikrotik_configuration_included": False,
            },
        )
        return Response(
            {
                "filename": backup_path.name,
                "size_bytes": backup_path.stat().st_size,
                "scope": "business",
            },
            status=status.HTTP_201_CREATED,
        )

    def restore_business(self, request, *args, **kwargs):
        """Restaure depuis la liste uniquement les données métier autorisées."""
        filename = request.data.get("filename")
        if not filename:
            return Response(
                {"detail": "Le nom de la sauvegarde métier doit être fourni."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        source_sql_path: Path | None = None
        safe_sql_path: Path | None = None
        pre_backup_name: str | None = None
        try:
            backup_path = self._safe_backup_path(str(filename))
            if (
                not self._is_admin(request.user)
                and not self._is_business_backup_name(backup_path.name)
            ):
                return Response(
                    {"detail": "Cette sauvegarde complète est réservée à l’administrateur."},
                    status=status.HTTP_403_FORBIDDEN,
                )

            source_sql_path = self._materialize_sql_file(backup_path)
            safe_sql_path, counts = self._build_business_restore_sql(source_sql_path)

            pre_backup_path = self._create_business_backup()
            pre_backup_name = pre_backup_path.name
            self._restore_database(safe_sql_path)
        except FileNotFoundError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_404_NOT_FOUND)
        except (ValueError, zipfile.BadZipFile, gzip.BadGzipFile, EOFError) as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except BackupCommandError as exc:
            return Response(
                {"detail": str(exc)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
        finally:
            for path in (safe_sql_path, source_sql_path):
                if path is not None:
                    path.unlink(missing_ok=True)

        AuditLog.objects.create(
            user=self._audit_user_after_restore(request),
            action="business_backup_restored",
            entity_type="Backup",
            entity_id=backup_path.name,
            payload={
                "filename": backup_path.name,
                "pre_backup": pre_backup_name,
                "tables": counts,
                "accounts_preserved": True,
                "mikrotik_configuration_preserved": True,
            },
        )
        return Response(
            {
                "detail": "Restauration des données métier terminée.",
                "restored": backup_path.name,
                "imported": counts,
                "pre_backup": pre_backup_name,
                "accounts_preserved": True,
                "mikrotik_configuration_preserved": True,
                "reload_required": True,
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

    @action(detail=False, methods=["post"], url_path="import-business")
    def import_business(self, request):
        """Importe les données métier pour un administrateur connecté."""
        uploaded_file = request.FILES.get("file")
        if uploaded_file is None:
            return Response(
                {"detail": "Sélectionnez une sauvegarde ZIP, SQL.GZ ou SQL."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        uploaded_path: Path | None = None
        source_sql_path: Path | None = None
        safe_sql_path: Path | None = None
        pre_backup_name: str | None = None
        try:
            uploaded_path = self._save_uploaded_backup(uploaded_file)
            source_sql_path = self._materialize_sql_file(uploaded_path)
            safe_sql_path, counts = self._build_business_restore_sql(source_sql_path)

            # Filet de sécurité automatique avant de remplacer les données métier.
            pre_backup_path = self._create_backup()
            pre_backup_name = pre_backup_path.name
            self._restore_database(safe_sql_path)
        except (ValueError, zipfile.BadZipFile, gzip.BadGzipFile, EOFError) as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except BackupCommandError as exc:
            return Response(
                {"detail": str(exc)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
        finally:
            for path in (safe_sql_path, source_sql_path, uploaded_path):
                if path is not None:
                    path.unlink(missing_ok=True)

        AuditLog.objects.create(
            user=self._audit_user_after_restore(request),
            action="business_data_imported",
            entity_type="Backup",
            entity_id=Path(str(uploaded_file.name)).name,
            payload={
                "filename": Path(str(uploaded_file.name)).name,
                "pre_backup": pre_backup_name,
                "tables": counts,
                "accounts_preserved": True,
                "mikrotik_configuration_preserved": True,
            },
        )

        return Response(
            {
                "detail": "Import des données métier terminé.",
                "imported": counts,
                "pre_backup": pre_backup_name,
                "accounts_preserved": True,
                "mikrotik_configuration_preserved": True,
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
