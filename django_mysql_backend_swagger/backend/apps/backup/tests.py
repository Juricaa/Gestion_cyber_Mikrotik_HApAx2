import os
import tempfile
from pathlib import Path

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
