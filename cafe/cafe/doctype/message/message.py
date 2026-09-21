import frappe
from frappe.model.document import Document


class Message(Document):
	def before_insert(self):
		self.sender = frappe.session.user
		full_name, user_image = frappe.db.get_value("User", self.sender, ["full_name", "user_image"])
		self.sender_name = full_name
		self.sender_image = user_image
