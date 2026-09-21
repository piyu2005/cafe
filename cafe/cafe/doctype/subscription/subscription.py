import frappe
from frappe.model.document import Document


class Subscription(Document):
	def before_insert(self):
		if not self.subscriber:
			self.subscriber = frappe.session.user
