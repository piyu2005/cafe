import frappe


def execute():
	"""Full-text search for the home feed (cafe.api.search_feed) needs this -
	MATCH/AGAINST requires a FULLTEXT index on exactly the columns it
	searches: title and display_title (both Data, short plain text) and
	excerpt (Small Text, also genuinely plain - HTML already stripped out of
	it before it's ever saved, see write_core.js's W.autoExcerpt). content
	itself is deliberately left out of both the index and the search: it's
	stored as raw HTML, and matching against it would surface markup, not
	the words a reader actually typed.

	Guarded by a SHOW INDEX check rather than letting a duplicate-index
	error happen, since patches can be re-run in some recovery scenarios and
	ALTER TABLE ADD FULLTEXT INDEX is not itself idempotent."""
	if frappe.db.sql("SHOW INDEX FROM `tabPost` WHERE Key_name = 'post_fulltext_index'"):
		return
	frappe.db.sql(
		"ALTER TABLE `tabPost` ADD FULLTEXT INDEX post_fulltext_index (title, display_title, excerpt)"
	)
	frappe.db.commit()
