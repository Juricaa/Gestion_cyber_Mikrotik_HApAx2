import os
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse

from .mikrotik import get_effective_mikrotik_configuration
from .models import MikroTikConfiguration


class MikroTikConfigurationApiTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.admin = User.objects.create_user(
            username="admin-router",
            password="secret",
            role="admin",
        )
        self.client.force_login(self.admin)
        self.url = reverse("mikrotik-config")
        self.test_url = reverse("mikrotik-config-test")

    @patch.dict(
        os.environ,
        {
            "MIKROTIK_BASE_URL": "http://192.168.88.1/rest",
            "MIKROTIK_USERNAME": "env-admin",
            "MIKROTIK_PASSWORD": "env-password",
            "MIKROTIK_ENABLE_HOTSPOT_SYNC": "false",
        },
        clear=False,
    )
    def test_get_uses_environment_without_exposing_password(self):
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["source"], "environment")
        self.assertTrue(response.data["password_configured"])
        self.assertNotIn("password", response.data)

    def test_save_encrypts_password_and_database_takes_priority(self):
        response = self.client.put(
            self.url,
            data={
                "base_url": "192.168.10.1",
                "username": "router-admin",
                "password": "routeur-secret",
                "enabled": True,
                "verify_ssl": False,
                "hotspot_profile": "paid_wifi",
            },
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200, response.data)
        stored = MikroTikConfiguration.objects.get()
        self.assertNotEqual(stored.password_encrypted, "routeur-secret")
        self.assertEqual(stored.get_password(), "routeur-secret")

        effective = get_effective_mikrotik_configuration()
        self.assertEqual(effective.source, "database")
        self.assertEqual(effective.base_url, "http://192.168.10.1/rest")
        self.assertEqual(effective.username, "router-admin")
        self.assertTrue(effective.enabled)

    def test_blank_password_preserves_existing_secret(self):
        config = MikroTikConfiguration.objects.create(
            base_url="http://192.168.1.1/rest",
            username="admin",
            enabled=True,
        )
        config.set_password("before")
        config.save()

        response = self.client.patch(
            self.url,
            data={"username": "new-admin", "password": ""},
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200, response.data)
        config.refresh_from_db()
        self.assertEqual(config.username, "new-admin")
        self.assertEqual(config.get_password(), "before")

    @patch("apps.sessions_app.mikrotik_views.MikroTikClient.test_connection")
    def test_connection_uses_unsaved_candidate_values(self, mocked_test):
        mocked_test.return_value = {
            "identity": "Cyber-Router",
            "version": "7.19",
            "board_name": "hAP ax2",
            "architecture": "arm64",
        }
        response = self.client.post(
            self.test_url,
            data={
                "base_url": "192.168.88.1",
                "username": "admin",
                "password": "secret",
            },
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["router"]["identity"], "Cyber-Router")

    def test_delete_returns_to_environment(self):
        MikroTikConfiguration.objects.create(
            base_url="http://10.0.0.1/rest",
            username="db-admin",
        )
        response = self.client.delete(self.url)
        self.assertEqual(response.status_code, 200)
        self.assertFalse(MikroTikConfiguration.objects.exists())
        self.assertEqual(response.data["source"], "environment")
