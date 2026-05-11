from .base import *
import os

def env_bool(name: str, default: bool = False) -> bool:
    value = os.getenv(name)

    if value is None:
        return default

    return str(value).strip().lower() in ("1", "true", "yes", "on")

MIKROTIK_ENABLE_HOTSPOT_SYNC = env_bool(
    "MIKROTIK_ENABLE_HOTSPOT_SYNC",
    default=True,
)

DEBUG = True

ALLOWED_HOSTS = csv_env(
    "DJANGO_ALLOWED_HOSTS",
    "127.0.0.1,localhost,192.168.88.252,192.168.88.254",
)
