import frappe
from frappe.utils.file_manager import save_file


def execute():
	"""Builder pages read their favicon from Builder Settings, not the usual
	Website Settings field (see BuilderPage.set_favicon) - every Cafe page is
	a Builder page, so that's the one that actually matters here. Website
	Settings is set too, for anything that ever falls back to the standard
	template. Idempotent: leaves either alone if it's already set, so a site
	that picked its own favicon isn't silently overridden on the next migrate."""
	ico_path = frappe.get_app_path("cafe", "public", "cafe-favicon.ico")
	# nosemgrep: frappe-security-file-traversal (hardcoded path to an asset shipped in this app, no user input involved)
	with open(ico_path, "rb") as f:
		content = f.read()

	for doctype in ("Builder Settings", "Website Settings"):
		doc = frappe.get_single(doctype)
		if doc.favicon:
			continue
		file_doc = save_file("cafe-favicon.ico", content, doctype, doc.name, is_private=0)
		doc.favicon = file_doc.file_url
		doc.flags.ignore_permissions = True
		doc.save()

	frappe.db.commit()
