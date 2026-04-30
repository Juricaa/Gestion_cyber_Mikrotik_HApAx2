from django.db import migrations


def create_default_stations(apps, schema_editor):
    Station = apps.get_model("stations", "Station")

    stations_to_create = []

    for i in range(1, 51):
        stations_to_create.append(
            Station(
                name=f"Wifi {i}",
                station_type="wifi",
                status="available",
                is_active=True,
            )
        )

    for i in range(1, 51):
        stations_to_create.append(
            Station(
                name=f"Console {i}",
                station_type="console",
                status="available",
                is_active=True,
            )
        )

    # ignore_conflicts=True évite l'erreur si une station existe déjà
    # car le champ name est unique dans ton modèle Station.
    Station.objects.bulk_create(stations_to_create, ignore_conflicts=True)


def delete_default_stations(apps, schema_editor):
    Station = apps.get_model("stations", "Station")

    wifi_names = [f"Wifi {i}" for i in range(1, 51)]
    console_names = [f"Console {i}" for i in range(1, 51)]

    Station.objects.filter(station_type="wifi", name__in=wifi_names).delete()
    Station.objects.filter(station_type="console", name__in=console_names).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("stations", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(create_default_stations, delete_default_stations),
    ]
