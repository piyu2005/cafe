"""Cafe points: a Hacker-News-style karma ledger. Entries are append-only -
a total is always the sum of a user's entries (see total()), never a cached
counter - so reversing an action (unlike, unsave) appends the matching
negative entry instead of mutating or deleting the original one."""

import frappe

ARTICLE_UPVOTE = "Article Upvote"
COMMENT_UPVOTE = "Comment Upvote"
COMMENT_DOWNVOTE = "Comment Downvote"
POST_SAVED = "Post Saved"
ONBOARDED = "Onboarded"
PROFILE_COMPLETED = "Profile Completed"
ARTICLE_PUBLISHED = "Article Published"
ARTICLE_REPOSTED = "Article Reposted"


def award(user, points, reason, reference_doctype=None, reference_name=None, actor=None):
	"""Logs a points change for `user`. No-op if `actor` (whoever triggered
	it) is `user` themself - acting on your own content never earns or costs
	you points. Also a no-op if `user` isn't a real, still-existing account
	(e.g. a post whose author was since deleted) - never blocks the action
	that triggered it over a stray points entry."""
	if (actor and actor == user) or not user or not frappe.db.exists("User", user):
		return
	frappe.get_doc(
		{
			"doctype": "Cafe Points Log",
			"user": user,
			"points": points,
			"reason": reason,
			"reference_doctype": reference_doctype,
			"reference_name": reference_name,
			"actor": actor,
		}
	).insert(ignore_permissions=True)


def award_once(user, points, reason, reference_doctype=None, reference_name=None):
	"""Same as award(), but for one-time events (onboarding, completing your
	profile, publishing a given post) - skips if this exact (user, reason,
	reference_name) combination was already logged, so re-saving an
	already-published post or an already-complete profile doesn't re-earn
	the points."""
	if not user or not frappe.db.exists("User", user):
		return
	filters = {"user": user, "reason": reason}
	if reference_name:
		filters["reference_name"] = reference_name
	if frappe.db.exists("Cafe Points Log", filters):
		return
	frappe.get_doc(
		{
			"doctype": "Cafe Points Log",
			"user": user,
			"points": points,
			"reason": reason,
			"reference_doctype": reference_doctype,
			"reference_name": reference_name,
		}
	).insert(ignore_permissions=True)


def total(user):
	# SUM() comes back as a Decimal even though `points` is an Int column.
	return int(
		frappe.db.sql("select coalesce(sum(points), 0) from `tabCafe Points Log` where user=%s", user)[0][
			0
		]
	)


def has_completed_profile(user_doc):
	return bool(user_doc.headline and user_doc.bio and user_doc.user_image)


def on_user_created(doc, method=None):
	# Every real Cafe account is a Website User (see hooks.py's own comment on
	# this) - System User accounts like Administrator aren't someone signing
	# up to the app. Guest is also user_type "Website User" in Frappe's own
	# seed data, so it needs excluding by name too.
	if doc.user_type == "Website User" and doc.name != "Guest":
		award_once(doc.name, 10, ONBOARDED)
