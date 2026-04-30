from .base import *

DEBUG = True

ALLOWED_HOSTS = csv_env(
    "DJANGO_ALLOWED_HOSTS",
    "127.0.0.1,localhost,192.168.88.252,192.168.88.254",
)
