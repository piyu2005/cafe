import frappe


def execute():
	"""toggle_like/toggle_save_post/toggle_repost (cafe/api.py) all follow the
	same exists-check-then-insert pattern with nothing underneath enforcing
	it atomically - a burst of concurrent requests (a slow network making
	someone double-tap, or two tabs) can all pass the exists-check before
	any of them inserts, creating several rows for what should be one
	toggle, each also double-awarding points. Confirmed with a 40-request
	concurrent stress test against toggle_save_post: all 40 succeeded,
	creating 40 separate Saved Post rows and 40x the points award for one
	logical save.

	A composite unique index is what actually closes this - unlike the
	Python-level exists-check, the database itself serializes concurrent
	inserts against the same index, so only the first one can ever
	succeed; every other concurrent attempt fails with a clean
	UniqueValidationError that cafe.api's toggle_* functions catch and
	treat as "already done by a concurrent request" instead of a real
	error."""
	frappe.db.add_unique("Saved Post", ["post", "user"])
	frappe.db.add_unique("Repost", ["post", "user"])
	frappe.db.add_unique("Like", ["reference_doctype", "reference_name", "user"])
