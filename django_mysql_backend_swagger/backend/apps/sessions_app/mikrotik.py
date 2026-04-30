import os
import re
import secrets
from typing import Optional
from urllib.parse import quote

import requests
from requests.auth import HTTPBasicAuth


class MikroTikError(Exception):
    pass


class MikroTikClient:
    def __init__(self):
        base_url = os.getenv("MIKROTIK_BASE_URL", "http://192.168.88.1/rest").rstrip("/")
        if not base_url.endswith("/rest"):
            base_url = f"{base_url}/rest"

        self.base_url = base_url
        self.username = os.getenv("MIKROTIK_USERNAME", "admin")
        self.password = os.getenv("MIKROTIK_PASSWORD", "Informaticien2025#")
        self.verify_ssl = os.getenv("MIKROTIK_VERIFY_SSL", "false").lower() == "true"
        self.hotspot_profile = os.getenv("MIKROTIK_HOTSPOT_PROFILE", "paid_wifi")
        self.enabled = os.getenv("MIKROTIK_ENABLE_HOTSPOT_SYNC", "false").lower() == "true"

    def _auth(self):
        return HTTPBasicAuth(self.username, self.password)

    def _ensure_enabled(self):
        if not self.enabled:
            raise MikroTikError("Synchronisation MikroTik désactivée")

    def _ensure_configured(self):
        if not self.base_url or not self.username or not self.password:
            raise MikroTikError("Identifiants MikroTik manquants")

    @staticmethod
    def _item_id(item: dict) -> Optional[str]:
        return item.get(".id") or item.get("id")

    @staticmethod
    def _item_path(item_id: str) -> str:
        # Garder * non encodé: RouterOS REST utilise des ID comme *1, *A.
        return quote(str(item_id), safe="*")

    def _request(self, method: str, path: str, **kwargs):
        self._ensure_enabled()
        self._ensure_configured()

        response = requests.request(
            method,
            f"{self.base_url}{path}",
            auth=self._auth(),
            verify=self.verify_ssl,
            timeout=15,
            **kwargs,
        )

        if response.status_code >= 400:
            raise MikroTikError(
                f"Erreur MikroTik {response.status_code} sur {method} {path}: {response.text}"
            )

        if not response.text:
            return {}

        try:
            return response.json()
        except ValueError:
            return {"raw": response.text}

    def _safe_request(self, method: str, path: str, **kwargs):
        try:
            return self._request(method, path, **kwargs)
        except Exception as exc:
            print(f"[MikroTik warning] {exc}")
            return None

    @staticmethod
    def seconds_to_routeros_time(seconds: int) -> str:
        seconds = max(0, int(seconds))
        h = seconds // 3600
        m = (seconds % 3600) // 60
        s = seconds % 60
        return f"{h:02d}:{m:02d}:{s:02d}"

    @staticmethod
    def routeros_time_to_seconds(value) -> int:
        """
        Convertit les durées RouterOS en secondes.
        Exemples acceptés: 45s, 1m10s, 2h03m04s, 1d02:03:04, 00:01:10.
        """
        raw = str(value or "").strip().lower()
        if not raw:
            return 0

        if raw.isdigit():
            return int(raw)

        # Format HH:MM:SS ou MM:SS.
        if ":" in raw and not re.search(r"[wdhms]", raw.replace("ms", "")):
            parts = [int(part or 0) for part in raw.split(":")]
            if len(parts) == 2:
                minutes, seconds = parts
                return minutes * 60 + seconds
            if len(parts) == 3:
                hours, minutes, seconds = parts
                return hours * 3600 + minutes * 60 + seconds
            if len(parts) == 4:
                days, hours, minutes, seconds = parts
                return days * 86400 + hours * 3600 + minutes * 60 + seconds

        total = 0
        for number, unit in re.findall(r"(\d+)(w|d|h|m|s)", raw):
            n = int(number)
            if unit == "w":
                total += n * 7 * 86400
            elif unit == "d":
                total += n * 86400
            elif unit == "h":
                total += n * 3600
            elif unit == "m":
                total += n * 60
            elif unit == "s":
                total += n

        return total

    def active_uptime_seconds(self, active_user: dict) -> int:
        return self.routeros_time_to_seconds(active_user.get("uptime"))

    @staticmethod
    def generate_voucher_code(prefix: str = "WIFI") -> str:
        prefix = (prefix or "WIFI").strip().upper()
        return f"{secrets.token_hex(3).upper()}"

    def list_hotspot_hosts(self):
        return self._request("GET", "/ip/hotspot/host")

    def find_hotspot_hosts(self, address: Optional[str] = None, mac_address: Optional[str] = None):
        mac_address = (mac_address or "").lower()
        hosts = []

        for host in self.list_hotspot_hosts():
            host_mac = (host.get("mac-address") or "").lower()
            host_addresses = {
                host.get("address"),
                host.get("to-address"),
            }

            if address and address not in host_addresses:
                continue

            if mac_address and host_mac != mac_address:
                continue

            hosts.append(host)

        return hosts

    def remove_hotspot_hosts(self, address: Optional[str] = None, mac_address: Optional[str] = None):
        removed = 0

        for host in self.find_hotspot_hosts(address=address, mac_address=mac_address):
            item_id = self._item_id(host)
            if not item_id:
                continue

            result = self._safe_request(
                "DELETE",
                f"/ip/hotspot/host/{self._item_path(item_id)}",
            )

            if result is None:
                result = self._safe_request(
                    "POST",
                    "/ip/hotspot/host/remove",
                    json={"numbers": item_id},
                )

            if result is not None:
                removed += 1

        return removed

    def login_hotspot_active_user(
        self,
        username: str,
        password: str,
        address: Optional[str] = None,
        mac_address: Optional[str] = None,
    ):
        """
        Reconnecte automatiquement un client Hotspot déjà détecté par MikroTik.
        Utilisé après une reprise de pause pour éviter que le téléphone reste sans Internet.
        """
        if mac_address:
            hosts = self.find_hotspot_hosts(mac_address=mac_address)
            if hosts:
                current_host = hosts[0]
                address = current_host.get("to-address") or current_host.get("address") or address

        if not address and not mac_address:
            raise MikroTikError("Impossible de reconnecter le client Hotspot: IP/MAC manquant")

        payload = {
            "user": username,
            "password": password,
        }

        if address:
            payload["ip"] = address
        if mac_address:
            payload["mac-address"] = mac_address

        # RouterOS v7 REST accepte les commandes avec POST /menu/commande.
        result = self._safe_request("POST", "/ip/hotspot/active/login", json=payload)
        if result is not None:
            return result

        # Quelques versions/firmwares n'acceptent pas le paramètre mac-address sur active/login.
        if mac_address:
            fallback_payload = {"user": username, "password": password}
            if address:
                fallback_payload["ip"] = address
            result = self._safe_request("POST", "/ip/hotspot/active/login", json=fallback_payload)
            if result is not None:
                return result

        raise MikroTikError("Auto-login MikroTik impossible. Voucher réactivé, mais le client doit rouvrir le portail.")

    def list_hotspot_users(self):
        return self._request("GET", "/ip/hotspot/user")

    def list_active_users(self):
        return self._request("GET", "/ip/hotspot/active")

    def find_hotspot_user(self, username: str):
        for user in self.list_hotspot_users():
            if user.get("name") == username:
                return user
        return None

    def find_active_users(self, username: str):
        return [item for item in self.list_active_users() if item.get("user") == username]

    def create_or_enable_voucher(
        self,
        code: str,
        username: Optional[str] = None,
        password: Optional[str] = None,
        limit_uptime_seconds: Optional[int] = None,
        comment: Optional[str] = None,
    ):
        username = username or code
        password = password or code

        payload = {
            "name": username,
            "password": password,
            "profile": self.hotspot_profile,
            "disabled": "false",
        }

        if comment:
            payload["comment"] = comment

        if limit_uptime_seconds is None:
            payload["limit-uptime"] = "0s"
        else:
            payload["limit-uptime"] = self.seconds_to_routeros_time(limit_uptime_seconds)

        existing = self.find_hotspot_user(username)

        if existing:
            item_id = self._item_id(existing)
            if not item_id:
                raise MikroTikError(f"ID MikroTik introuvable pour user {username}")

            update_payload = payload.copy()
            update_payload.pop("name", None)

            self._request(
                "PATCH",
                f"/ip/hotspot/user/{self._item_path(item_id)}",
                json=update_payload,
            )

            return {
                "id": item_id,
                "name": username,
                "password": password,
                "reused": True,
            }

        # RouterOS REST: PUT = add
        data = self._request("PUT", "/ip/hotspot/user", json=payload)

        return {
            "id": data.get(".id") or data.get("id"),
            "name": username,
            "password": password,
            "reused": False,
        }

    def disconnect_active_user(self, username: str):
        active_users = self.find_active_users(username)
        disconnected = 0

        for active in active_users:
            item_id = self._item_id(active)
            if not item_id:
                continue

            result = self._safe_request(
                "DELETE",
                f"/ip/hotspot/active/{self._item_path(item_id)}",
            )

            if result is None:
                result = self._safe_request(
                    "POST",
                    "/ip/hotspot/active/remove",
                    json={"numbers": item_id},
                )

            if result is not None:
                disconnected += 1

        return disconnected

    def disable_hotspot_user(self, username: str):
        user = self.find_hotspot_user(username)

        if not user:
            self.disconnect_active_user(username)
            return False

        item_id = self._item_id(user)
        if not item_id:
            self.disconnect_active_user(username)
            return False

        result = self._safe_request(
            "PATCH",
            f"/ip/hotspot/user/{self._item_path(item_id)}",
            json={"disabled": "true"},
        )

        if result is None:
            self._safe_request(
                "POST",
                "/ip/hotspot/user/disable",
                json={"numbers": item_id},
            )

        self.disconnect_active_user(username)
        return True

    def enable_hotspot_user(self, username: str):
        user = self.find_hotspot_user(username)

        if not user:
            return False

        item_id = self._item_id(user)
        if not item_id:
            return False

        result = self._safe_request(
            "PATCH",
            f"/ip/hotspot/user/{self._item_path(item_id)}",
            json={"disabled": "false"},
        )

        if result is None:
            self._request(
                "POST",
                "/ip/hotspot/user/enable",
                json={"numbers": item_id},
            )

        return True

    def remove_hotspot_user(self, username: str):
        self.disconnect_active_user(username)

        user = self.find_hotspot_user(username)
        if not user:
            return False

        item_id = self._item_id(user)
        if not item_id:
            return False

        result = self._safe_request("DELETE", f"/ip/hotspot/user/{self._item_path(item_id)}")
        if result is None:
            self._safe_request(
                "POST",
                "/ip/hotspot/user/remove",
                json={"numbers": item_id},
            )

        return True

    def recreate_countdown_voucher(
        self,
        code: str,
        remaining_seconds: int,
        username: Optional[str] = None,
        password: Optional[str] = None,
        comment: Optional[str] = None,
    ):
        username = username or code
        password = password or code

        self.remove_hotspot_user(username)

        return self.create_or_enable_voucher(
            code=code,
            username=username,
            password=password,
            limit_uptime_seconds=remaining_seconds,
            comment=comment,
        )


def get_mikrotik_client() -> MikroTikClient:
    return MikroTikClient()
