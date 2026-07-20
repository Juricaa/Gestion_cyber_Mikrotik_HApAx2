import gzip
import os
import tempfile
import zipfile
from pathlib import Path
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import SimpleTestCase, TestCase
from rest_framework.test import APIClient

from .views import BackupViewSet


class BackupViewSetTests(SimpleTestCase):
    def test_sanitize_filename_rejects_path_traversal(self):
        view = BackupViewSet()

        with self.assertRaises(ValueError):
            view._sanitize_filename("../secret.sql")

        with self.assertRaises(ValueError):
            view._sanitize_filename("nested/backup.zip")

    def test_resolve_backup_dir_uses_environment_variable(self):
        original = os.environ.get("BACKUP_DIR")
        temporary_dir = tempfile.TemporaryDirectory()
        os.environ["BACKUP_DIR"] = temporary_dir.name

        try:
            view = BackupViewSet()
            backup_dir = view._resolve_backup_dir()
            self.assertEqual(Path(temporary_dir.name).resolve(), backup_dir.resolve())
            self.assertTrue(backup_dir.exists())
        finally:
            if original is not None:
                os.environ["BACKUP_DIR"] = original
            else:
                os.environ.pop("BACKUP_DIR", None)
            temporary_dir.cleanup()

    def test_format_sql_value_handles_basic_types(self):
        view = BackupViewSet()
        self.assertEqual(view._format_sql_value(None), "NULL")
        self.assertEqual(view._format_sql_value(True), "1")
        self.assertEqual(view._format_sql_value(False), "0")
        self.assertEqual(view._format_sql_value(42), "42")
        self.assertEqual(view._format_sql_value(3.14), "3.14")
        self.assertEqual(view._format_sql_value("O'Reilly"), "'O\\'Reilly'")
        self.assertEqual(view._format_sql_value("back\\slash"), "'back\\\\slash'")

    def test_materialize_sql_file_supports_unified_zip(self):
        view = BackupViewSet()
        sql = b"DROP TABLE IF EXISTS `demo`;\nCREATE TABLE `demo` (`id` int);\n"

        with tempfile.TemporaryDirectory() as directory:
            archive_path = Path(directory) / "cyber_manager_20260711_120000.zip"
            with zipfile.ZipFile(archive_path, "w", zipfile.ZIP_DEFLATED) as archive:
                archive.writestr("cyber_manager.sql", sql)

            extracted = view._materialize_sql_file(archive_path)
            try:
                self.assertEqual(extracted.read_bytes(), sql)
            finally:
                extracted.unlink(missing_ok=True)

    def test_materialize_sql_file_keeps_legacy_sql_gz_compatibility(self):
        view = BackupViewSet()
        sql = b"/*!40101 SET NAMES utf8mb4 */;\nCREATE TABLE `demo` (`id` int);\n"

        with tempfile.TemporaryDirectory() as directory:
            archive_path = Path(directory) / "cyber_manager_2026-07-06_12-19.sql.gz"
            with gzip.open(archive_path, "wb") as archive:
                archive.write(sql)

            extracted = view._materialize_sql_file(archive_path)
            try:
                self.assertEqual(extracted.read_bytes(), sql)
            finally:
                extracted.unlink(missing_ok=True)

    def test_create_backup_uses_unified_zip_structure(self):
        view = BackupViewSet()
        original = os.environ.get("BACKUP_DIR")

        with tempfile.TemporaryDirectory() as directory:
            os.environ["BACKUP_DIR"] = directory
            try:
                with patch.object(
                    view,
                    "_database_config",
                    return_value={
                        "name": "cyber_manager",
                        "user": "user",
                        "password": "secret",
                        "host": "db",
                        "port": "3306",
                    },
                ), patch.object(
                    view,
                    "_dump_database",
                    side_effect=lambda path: path.write_text(
                        "CREATE TABLE `demo` (`id` int);\n", encoding="utf-8"
                    ),
                ):
                    archive_path = view._create_backup()

                self.assertTrue(archive_path.name.startswith("cyber_manager_"))
                self.assertTrue(archive_path.name.endswith(".zip"))
                with zipfile.ZipFile(archive_path, "r") as archive:
                    self.assertEqual(archive.namelist(), ["cyber_manager.sql"])
            finally:
                if original is not None:
                    os.environ["BACKUP_DIR"] = original
                else:
                    os.environ.pop("BACKUP_DIR", None)

    def test_create_business_backup_uses_selective_zip_structure(self):
        view = BackupViewSet()
        original = os.environ.get("BACKUP_DIR")

        with tempfile.TemporaryDirectory() as directory:
            os.environ["BACKUP_DIR"] = directory
            try:
                with patch.object(
                    view,
                    "_database_config",
                    return_value={
                        "name": "cyber_manager",
                        "user": "user",
                        "password": "secret",
                        "host": "db",
                        "port": "3306",
                    },
                ), patch.object(
                    view,
                    "_dump_business_database",
                    side_effect=lambda path: path.write_text(
                        "INSERT INTO `stations_station` VALUES (1,'Wifi 1','wifi','available',1);\n",
                        encoding="utf-8",
                    ),
                ):
                    archive_path = view._create_business_backup()

                self.assertTrue(archive_path.name.startswith("cyber_manager_business_"))
                self.assertTrue(archive_path.name.endswith(".zip"))
                with zipfile.ZipFile(archive_path, "r") as archive:
                    self.assertEqual(archive.namelist(), ["cyber_manager_business.sql"])
            finally:
                if original is not None:
                    os.environ["BACKUP_DIR"] = original
                else:
                    os.environ.pop("BACKUP_DIR", None)


class BusinessImportSanitizerTests(SimpleTestCase):
    def setUp(self):
        self.view = BackupViewSet()
        self.columns = {
            "stations_station": ["id", "name", "station_type", "status", "is_active"],
            "pricing_tariff": [
                "id", "service_type", "hourly_rate", "minimum_price",
                "active", "updated_at", "updated_by_id",
            ],
            "sessions_app_session": [
                "id", "client_name", "voucher_code", "mikrotik_username",
                "mikrotik_user_id", "service_type", "session_mode",
                "countdown_seconds", "remaining_seconds", "started_at",
                "expected_end_at", "ended_at", "last_resumed_at",
                "consumed_seconds", "paused_duration_seconds", "status",
                "hourly_rate_snapshot", "minimum_price_snapshot", "final_price",
                "closed_by_id", "created_by_id", "station_id", "created_at",
                "updated_at", "payment_status", "paid_at", "paid_by_id",
            ],
            "sessions_app_sessionevent": [
                "id", "event_type", "timestamp", "note", "session_id", "user_id",
            ],
            "sales_filmsale": [
                "id", "title", "quantity", "unit_price", "total_price",
                "sold_at", "sold_by_id",
            ],
        }

    def test_sql_splitter_keeps_semicolon_inside_string(self):
        statements = list(self.view._iter_sql_statements(
            "INSERT INTO `sales_filmsale` (`id`,`title`) VALUES (1,'Film; Série');"
            "INSERT INTO `accounts_user` (`id`) VALUES (1);"
        ))
        self.assertEqual(len(statements), 2)
        self.assertIn("Film; Série", statements[0])

    def test_normalize_business_insert_supports_legacy_values_without_columns(self):
        normalized = self.view._normalize_business_insert(
            "INSERT INTO `stations_station` VALUES (1,'Wifi 1','wifi','available',1),"
            "(2,'Console 1','console','available',1);",
            self.columns,
        )
        self.assertIsNotNone(normalized)
        table_name, sql, row_count = normalized
        self.assertEqual(table_name, "stations_station")
        self.assertEqual(row_count, 2)
        self.assertIn("(`id`, `name`, `station_type`, `status`, `is_active`)", sql)

    def test_normalize_business_insert_rejects_sql_expression(self):
        with self.assertRaises(ValueError):
            self.view._normalize_business_insert(
                "INSERT INTO `stations_station` (`id`,`name`,`station_type`,`status`,`is_active`) "
                "VALUES (1,(SELECT username FROM accounts_user LIMIT 1),'wifi','available',1);",
                self.columns,
            )

    def test_build_business_restore_sql_excludes_accounts_and_nulls_operators(self):
        source = """
        INSERT INTO `accounts_user` (`id`,`username`) VALUES (9,'ancien');
        INSERT INTO `stations_station` (`id`,`name`,`station_type`,`status`,`is_active`)
        VALUES (1,'Wifi 1','wifi','available',1);
        INSERT INTO `pricing_tariff`
        (`id`,`service_type`,`hourly_rate`,`minimum_price`,`active`,`updated_at`,`updated_by_id`)
        VALUES (1,'wifi',1000.00,500.00,1,'2026-07-13 10:00:00',9);
        """
        with tempfile.TemporaryDirectory() as directory:
            source_path = Path(directory) / "source.sql"
            source_path.write_text(source, encoding="utf-8")
            with patch.object(
                self.view,
                "_target_table_columns",
                side_effect=lambda table: self.columns[table],
            ):
                safe_path, counts = self.view._build_business_restore_sql(source_path)
            try:
                safe_sql = safe_path.read_text(encoding="utf-8")
            finally:
                safe_path.unlink(missing_ok=True)

        self.assertNotIn("accounts_user", safe_sql)
        self.assertIn("DELETE FROM `reports_dailycashreconciliation`;", safe_sql)
        self.assertIn("UPDATE `pricing_tariff` SET `updated_by_id`=NULL;", safe_sql)
        self.assertEqual(counts["stations_station"], 1)
        self.assertEqual(counts["pricing_tariff"], 1)


class BusinessImportEndpointPermissionTests(TestCase):
    def setUp(self):
        user_model = get_user_model()
        self.admin = user_model.objects.create_user(
            username="backup-admin",
            password="test-pass",
            role="admin",
            is_staff=True,
        )
        self.viewer = user_model.objects.create_user(
            username="backup-viewer",
            password="test-pass",
            role="viewer",
            is_staff=False,
        )

    def test_import_business_rejects_anonymous_user(self):
        client = APIClient(enforce_csrf_checks=True)
        response = client.post(
            "/api/backup/import-business/",
            {},
            format="multipart",
        )
        self.assertEqual(response.status_code, 403)

    def test_import_business_rejects_non_admin_user(self):
        client = APIClient(enforce_csrf_checks=True)
        client.force_login(self.viewer)
        response = client.post(
            "/api/backup/import-business/",
            {},
            format="multipart",
        )
        self.assertEqual(response.status_code, 403)

    def test_import_business_accepts_admin_session_without_csrf_token(self):
        client = APIClient(enforce_csrf_checks=True)
        client.force_login(self.admin)
        response = client.post(
            "/api/backup/import-business/",
            {},
            format="multipart",
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.data["detail"],
            "Sélectionnez une sauvegarde ZIP, SQL.GZ ou SQL.",
        )


class SharedBusinessBackupPermissionTests(TestCase):
    def setUp(self):
        user_model = get_user_model()
        self.viewer = user_model.objects.create_user(
            username="shared-backup-viewer",
            password="test-pass",
            role="viewer",
            is_staff=False,
        )
        self.admin = user_model.objects.create_user(
            username="shared-backup-admin",
            password="test-pass",
            role="admin",
            is_staff=True,
        )
        self.temporary_dir = tempfile.TemporaryDirectory()
        self.original_backup_dir = os.environ.get("BACKUP_DIR")
        os.environ["BACKUP_DIR"] = self.temporary_dir.name

    def tearDown(self):
        if self.original_backup_dir is None:
            os.environ.pop("BACKUP_DIR", None)
        else:
            os.environ["BACKUP_DIR"] = self.original_backup_dir
        self.temporary_dir.cleanup()

    def test_anonymous_user_cannot_create_business_backup(self):
        client = APIClient(enforce_csrf_checks=True)
        response = client.post("/api/backup/business/", {}, format="json")
        self.assertEqual(response.status_code, 403)

    def test_viewer_can_create_business_backup_without_csrf_token(self):
        archive_path = Path(self.temporary_dir.name) / "cyber_manager_business_20260716_120000.zip"
        archive_path.write_bytes(b"zip")

        client = APIClient(enforce_csrf_checks=True)
        client.force_login(self.viewer)
        with patch.object(
            BackupViewSet,
            "_create_business_backup",
            return_value=archive_path,
        ):
            response = client.post("/api/backup/business/", {}, format="json")

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["scope"], "business")

    def test_viewer_can_open_backup_list_but_only_sees_business_files(self):
        backup_dir = Path(self.temporary_dir.name)
        (backup_dir / "cyber_manager_business_20260716_120000.zip").write_bytes(b"business")
        (backup_dir / "cyber_manager_20260716_120100.zip").write_bytes(b"full")

        client = APIClient()
        client.force_login(self.viewer)
        response = client.get("/api/backup/")

        self.assertEqual(response.status_code, 200)
        names = [row["filename"] for row in response.data["backups"]]
        self.assertEqual(names, ["cyber_manager_business_20260716_120000.zip"])
        self.assertEqual(response.data["backups"][0]["scope"], "business")

    def test_viewer_cannot_create_full_backup(self):
        client = APIClient(enforce_csrf_checks=True)
        client.force_login(self.viewer)
        response = client.post("/api/backup/", {}, format="json")
        self.assertEqual(response.status_code, 403)

    def test_viewer_can_call_business_restore_without_csrf_token(self):
        client = APIClient(enforce_csrf_checks=True)
        client.force_login(self.viewer)
        response = client.post("/api/backup/restore-business/", {}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.data["detail"],
            "Le nom de la sauvegarde métier doit être fourni.",
        )

    def test_admin_sees_full_and_business_files(self):
        backup_dir = Path(self.temporary_dir.name)
        (backup_dir / "cyber_manager_business_20260716_120000.zip").write_bytes(b"business")
        (backup_dir / "cyber_manager_20260716_120100.zip").write_bytes(b"full")

        client = APIClient()
        client.force_login(self.admin)
        response = client.get("/api/backup/")

        self.assertEqual(response.status_code, 200)
        names = {row["filename"] for row in response.data["backups"]}
        self.assertEqual(
            names,
            {
                "cyber_manager_business_20260716_120000.zip",
                "cyber_manager_20260716_120100.zip",
            },
        )
