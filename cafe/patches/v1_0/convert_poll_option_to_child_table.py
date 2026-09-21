import frappe


def execute():
	"""Poll Option used to be a standalone doctype with its own "poll" Link
	field back to Poll - every other one-to-many relationship in this app
	(Post -> Post Image, Message -> Message Attachment) correctly uses a
	child table instead, since options never exist independently of their
	poll. Converting to match: the doctype JSON now declares istable=1 and
	drops the "poll" field.

	Frappe's normal schema sync only adds/alters columns that are declared
	fields in the JSON - parent/parenttype/parentfield are baked into a
	table's structure only at CREATE TABLE time based on istable, and are
	never retroactively ALTERed onto an existing table when istable flips
	later (confirmed empirically: reload_doctype(force=True) followed by a
	full migrate left this table without them). So this patch adds those
	three columns itself, matching the exact column spec Frappe uses for
	every other child table (checked directly against Post Image's own
	`parent`/`parentfield`/`parenttype` column definitions), before moving
	each existing row's data into that shape.
	"""
	frappe.reload_doctype("Poll", force=True)
	frappe.reload_doctype("Poll Option", force=True)

	if not frappe.db.has_column("Poll Option", "poll"):
		return

	if not frappe.db.has_column("Poll Option", "parent"):
		frappe.db.sql_ddl("alter table `tabPoll Option` add column `parent` varchar(140)")
		frappe.db.sql_ddl("alter table `tabPoll Option` add index `parent` (`parent`)")
	if not frappe.db.has_column("Poll Option", "parentfield"):
		frappe.db.sql_ddl("alter table `tabPoll Option` add column `parentfield` varchar(140)")
	if not frappe.db.has_column("Poll Option", "parenttype"):
		frappe.db.sql_ddl("alter table `tabPoll Option` add column `parenttype` varchar(140)")

	rows = frappe.db.sql(
		"select name, poll from `tabPoll Option` where parent is null or parent = '' order by poll, creation",
		as_dict=True,
	)

	idx_by_poll = {}
	for row in rows:
		idx_by_poll[row.poll] = idx_by_poll.get(row.poll, 0) + 1
		frappe.db.sql(
			"""update `tabPoll Option`
			set parent=%s, parenttype='Poll', parentfield='options', idx=%s
			where name=%s""",
			(row.poll, idx_by_poll[row.poll], row.name),
		)

	frappe.db.commit()
