import frappe
from frappe.model.document import Document


class PostComment(Document):
	def before_insert(self):
		self.comment_by = frappe.session.user
		full_name, user_image = frappe.db.get_value("User", self.comment_by, ["full_name", "user_image"])
		self.comment_by_name = full_name
		self.comment_by_image = user_image
