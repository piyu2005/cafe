"""Serves the Builder Home page at the site root, and only while it is published.

Every other page of the app is a Builder page with its own route, and Builder
finds it by that route. "/" is different: Builder's own way to take "/" is its
home page setting, which needs the page to be marked there. This renderer
avoids the setting. It is tried before Builder's own (this app comes first in
the app order), it only answers for "/", and it only answers while the
"mna-home" page is published. Unpublish that page in Builder and "/" goes back
to Frappe's own home page, with nothing else to undo.
"""

import frappe

HOME_ROUTE = "mna-home"

try:
	from builder.builder.doctype.builder_page.builder_page import BuilderPageRenderer
except ImportError:  # Builder is not installed: "/" is left to Frappe
	BuilderPageRenderer = None


def is_root_request():
	request = getattr(frappe.local, "request", None)
	return bool(request) and request.path in ("", "/")


if BuilderPageRenderer:

	class HomeRenderer(BuilderPageRenderer):
		def can_render(self):
			if not is_root_request():
				return False
			self.path = HOME_ROUTE
			return super().can_render()

else:

	class HomeRenderer:
		def __init__(self, path, http_status_code=None):
			pass

		def can_render(self):
			return False
