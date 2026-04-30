@echo off
cd /d "%~dp0"

if not exist .venv (
    python -m venv .venv
)

call .venv\Scripts\activate

python -m pip install --upgrade pip
pip install -r requirements\dev.txt

echo.
echo Si la base est encore cassee, execute d'abord reset_db.sql dans MariaDB.
echo.
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver 0.0.0.0:8000
