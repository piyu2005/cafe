import frappe


def _notify(recipient, actor, notif_type, message, reference_doctype=None, reference_name=None):
	if not recipient or recipient == actor:
		return

	actor_name, actor_image = None, None
	if actor:
		actor_name, actor_image = frappe.db.get_value("User", actor, ["full_name", "user_image"])

	doc = frappe.get_doc(
		{
			"doctype": "App Notification",
			"recipient": recipient,
			"actor": actor,
			"actor_name": actor_name,
			"actor_image": actor_image,
			"type": notif_type,
			"reference_doctype": reference_doctype,
			"reference_name": reference_name,
			"message": message,
		}
	)
	doc.flags.ignore_permissions = True
	doc.insert()
	frappe.publish_realtime("notification:new", doc.as_dict(), user=recipient, after_commit=True)


@frappe.whitelist()
def list_notifications():
	rows = frappe.db.get_all(
		"App Notification",
		filters={"recipient": frappe.session.user},
		fields=[
			"name",
			"actor",
			"actor_name",
			"actor_image",
			"type",
			"reference_doctype",
			"reference_name",
			"message",
			"is_read",
			"creation",
		],
		order_by="creation desc",
		limit_page_length=50,
	)
	actors = {r.actor for r in rows if r.actor}
	usernames = (
		dict(
			frappe.db.get_all(
				"User", filters={"name": ["in", list(actors)]}, fields=["name", "username"], as_list=True
			)
		)
		if actors
		else {}
	)
	for r in rows:
		r.actor_username = usernames.get(r.actor)
		if r.type == "Group Invite" and r.reference_doctype == "Group Invite":
			r.request_status = frappe.db.get_value("Group Invite", r.reference_name, "status")
		elif r.type == "Publication Invite" and r.reference_doctype == "Publication Invite":
			r.request_status = frappe.db.get_value("Publication Invite", r.reference_name, "status")
	return rows


@frappe.whitelist()
def unread_notification_count():
	return frappe.db.count("App Notification", {"recipient": frappe.session.user, "is_read": 0})


@frappe.whitelist()
def mark_notification_read(name: str | None = None):
	if name:
		# Filtered on recipient too, not just name - otherwise any caller who
		# somehow learned another user's notification id could mark it read
		# for them. A name that isn't actually this user's just matches
		# nothing and no-ops, same as it would for one that doesn't exist.
		frappe.db.set_value(
			"App Notification", {"name": name, "recipient": frappe.session.user}, "is_read", 1
		)
	else:
		frappe.db.set_value(
			"App Notification", {"recipient": frappe.session.user, "is_read": 0}, "is_read", 1
		)
	return "success"
