@echo off
cd /d %~dp0\backend
python -m venv .venv
call .venv\Scripts\activate
pip install -r requirements\dev.txt
python manage.py makemigrations
python manage.py migrate
python manage.py createsuperuser

python manage.py runserver 0.0.0.0:8000
