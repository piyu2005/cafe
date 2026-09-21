import frappe
from frappe.model.document import Document


class PublicationInvite(Document):
	def before_insert(self):
		self.invited_by = frappe.session.user
