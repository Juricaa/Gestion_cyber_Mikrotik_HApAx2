from datetime import datetime
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from apps.sales.models import FilmSale
from apps.sessions_app.models import Session
from apps.stations.models import Station

from .models import DailyCashReconciliation


class CashReconciliationCleanupTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            username="admin-test",
            password="test-password",
            role="admin",
        )
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.station = Station.objects.create(
            name="Poste test",
            station_type=Station.Type.CONSOLE,
        )
        self.day = datetime(2026, 7, 11, 12, 0)
        self.day_aware = timezone.make_aware(
            self.day,
            timezone.get_current_timezone(),
        )

    def create_completed_session(self, name="Client test"):
        return Session.objects.create(
            client_name=name,
            station=self.station,
            service_type="console",
            started_at=self.day_aware,
            ended_at=self.day_aware,
            status=Session.Status.COMPLETED,
            payment_status=Session.PaymentStatus.PAID,
            paid_at=self.day_aware,
            final_price=Decimal("3000.00"),
            created_by=self.user,
            closed_by=self.user,
            paid_by=self.user,
        )

    def create_sale(self, title="Film test"):
        sale = FilmSale.objects.create(
            title=title,
            quantity=1,
            unit_price=Decimal("1500.00"),
            sold_by=self.user,
        )
        FilmSale.objects.filter(pk=sale.pk).update(sold_at=self.day_aware)
        sale.refresh_from_db()
        return sale

    def create_reconciliation(self):
        return DailyCashReconciliation.objects.create(
            date=self.day.date(),
            actual_amount=Decimal("3000.00"),
            created_by=self.user,
            updated_by=self.user,
        )

    def test_deleting_last_session_removes_real_payment(self):
        session = self.create_completed_session()
        self.create_reconciliation()

        response = self.client.delete(reverse("sessions-detail", args=[session.id]))

        self.assertEqual(response.status_code, 204)
        self.assertFalse(
            DailyCashReconciliation.objects.filter(date=self.day.date()).exists()
        )

    def test_deleting_one_session_keeps_real_payment_when_another_revenue_remains(self):
        session = self.create_completed_session("Client A")
        self.create_completed_session("Client B")
        self.create_reconciliation()

        response = self.client.delete(reverse("sessions-detail", args=[session.id]))

        self.assertEqual(response.status_code, 204)
        self.assertTrue(
            DailyCashReconciliation.objects.filter(date=self.day.date()).exists()
        )

    def test_deleting_last_sale_removes_real_payment(self):
        sale = self.create_sale()
        self.create_reconciliation()

        response = self.client.delete(reverse("film-sales-detail", args=[sale.id]))

        self.assertEqual(response.status_code, 204)
        self.assertFalse(
            DailyCashReconciliation.objects.filter(date=self.day.date()).exists()
        )

    def test_deleting_sale_keeps_real_payment_when_session_remains(self):
        sale = self.create_sale()
        self.create_completed_session()
        self.create_reconciliation()

        response = self.client.delete(reverse("film-sales-detail", args=[sale.id]))

        self.assertEqual(response.status_code, 204)
        self.assertTrue(
            DailyCashReconciliation.objects.filter(date=self.day.date()).exists()
        )
