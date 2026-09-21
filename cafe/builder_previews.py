"""Thumbnails for the app's Builder pages, shown in Builder's folder view.

Builder makes a thumbnail when a page is saved in its editor, in a background
job. The pages of this app are imported from files, so nothing makes one, and
the folder view shows blank cards. This makes the missing or out-of-date ones
after every migrate, as the Administrator: Builder renders the page as that
user, so a page that needs a sign-in shows its content instead of a redirect.
"""

import os

import frappe

APP = "cafe"


def generate_missing_previews():
	if not frappe.db.exists("DocType", "Builder Page"):
		return
	# Builder syncs the pages after every migrate too, but the order of the two
	# hooks is not fixed, and the import skips what is already current.
	try:
		from builder.export_import_standard_page import sync_standard_builder_pages

		sync_standard_builder_pages(APP)
	except Exception:
		frappe.log_error(title="Builder pages of cafe could not be synced")
		return

	# nosemgrep: frappe-setuser (Builder makes the folder thumbnails as this user, once, after a migrate)
	frappe.set_user("Administrator")
	for name in frappe.get_all("Builder Page", filters={"app": APP}, pluck="name"):
		make_preview(name)


def make_preview(name):
	page = frappe.get_doc("Builder Page", name)
	if not needs_preview(page):
		return
	try:
		page.generate_page_preview_image()
		frappe.db.commit()
	except Exception:
		# No headless browser on the server, say. The page works without one.
		frappe.db.rollback()
		frappe.log_error(title=f"Thumbnail of the Builder page {name} could not be made")


def needs_preview(page):
	if not page.preview:
		return True
	path = frappe.get_site_path("public", page.preview.split("?")[0].lstrip("/"))
	return (
		not os.path.exists(path)
		or os.path.getmtime(path) < frappe.utils.get_datetime(page.modified).timestamp()
	)
