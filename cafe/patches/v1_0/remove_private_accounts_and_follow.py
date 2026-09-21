import frappe


def execute():
	"""Private accounts and the follow feature are gone. Delete the data they
	left behind: the follow rows in Subscription (Publication subscriptions
	use the same doctype and stay), the notifications only follow created,
	and the User.is_private custom field.

	This patch does not delete the Follow Request doctype or the unused
	is_private column. Migrate already removes a doctype whose code is gone
	(remove_orphan_doctypes). Frappe never drops a column on its own, and an
	unused column does no harm. Both are risky changes for only a small
	benefit, so leave them to Frappe."""
	frappe.db.delete("Subscription", {"reference_doctype": "User"})

	frappe.db.delete(
		"App Notification",
		{"type": ["in", ["Follow Request", "Follow Accepted", "New Follower", "New Post"]]},
	)

	frappe.db.delete("Custom Field", {"dt": "User", "fieldname": "is_private"})
	frappe.clear_cache(doctype="User")
