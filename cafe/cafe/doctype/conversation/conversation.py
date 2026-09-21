import frappe
from frappe.model.document import Document


class Conversation(Document):
	def on_trash(self):
		# Message has its own child table (attachments) that only
		# frappe.delete_doc actually cleans up - a raw frappe.db.delete here
		# would just trade one orphan (this conversation's messages) for
		# another (those messages' own attachment rows).
		for name in frappe.get_all("Message", filters={"conversation": self.name}, pluck="name"):
			frappe.delete_doc("Message", name, ignore_permissions=True, force=True)
		frappe.db.delete("Conversation Member", {"conversation": self.name})
		frappe.db.delete("Group Invite", {"conversation": self.name})
