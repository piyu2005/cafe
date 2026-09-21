import frappe
from frappe.model.document import Document


class WorkEntry(Document):
	def before_insert(self):
		self.user = frappe.session.user
