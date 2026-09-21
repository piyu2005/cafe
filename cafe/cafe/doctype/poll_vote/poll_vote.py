import frappe
from frappe.model.document import Document


class PollVote(Document):
	def before_insert(self):
		self.user = frappe.session.user
