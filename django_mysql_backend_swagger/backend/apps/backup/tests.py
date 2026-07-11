import gzip
import os
import tempfile
import zipfile
from pathlib import Path
from unittest.mock import patch

from django.test import SimpleTestCase

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
