import frappe
from frappe.model.utils.rename_field import rename_field


def execute():
	"""Like and Subscription called this field "reference_type" while every
	other polymorphic-reference doctype in the app (and Frappe core's own
	Comment/ToDo) calls it "reference_doctype" - renaming for consistency.
	rename_field() does an in-place ALTER TABLE, not a drop-and-recreate, so
	existing rows keep their values."""
	frappe.reload_doctype("Like")
	frappe.reload_doctype("Subscription")

	if frappe.db.has_column("Like", "reference_type"):
		rename_field("Like", "reference_type", "reference_doctype")

	if frappe.db.has_column("Subscription", "reference_type"):
		rename_field("Subscription", "reference_type", "reference_doctype")
