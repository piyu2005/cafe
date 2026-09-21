import frappe
from frappe.tests import IntegrationTestCase


class TestSmoke(IntegrationTestCase):
	def test_app_is_installed(self):
		self.assertIn("cafe", frappe.get_installed_apps())
