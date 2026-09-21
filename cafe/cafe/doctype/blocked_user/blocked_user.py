import frappe
from frappe.model.document import Document


class BlockedUser(Document):
	def before_insert(self):
		self.blocker = frappe.session.user
