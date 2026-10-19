import frappe

from cafe import points


def execute():
	"""Cafe points (see cafe/points.py) only started being logged going
	forward once the hooks were added - this backfills a starting ledger for
	everything that already happened: existing accounts, already-complete
	profiles, already-published posts, and existing likes/saves."""

	# Guest is also user_type "Website User" in Frappe's own seed data (see
	# the same exclusion in points.on_user_created and cafe/api.py:368).
	real_user_filters = {"enabled": 1, "user_type": "Website User", "name": ["!=", "Guest"]}
	users = frappe.get_all(
		"User", filters=real_user_filters, fields=["name", "headline", "bio", "user_image"]
	)
	for user in users:
		points.award_once(user.name, 10, points.ONBOARDED)
		# Inlines what has_completed_profile() checked at the time this patch
		# was written (headline/bio/photo only) rather than calling it directly -
		# that function has since grown stricter (job_title/company/work/
		# education entries), and this backfill should keep replaying the
		# original historical rule, not today's.
		if user.headline and user.bio and user.user_image:
			points.award_once(user.name, 10, points.PROFILE_COMPLETED)

	for post in frappe.get_all("Post", filters={"status": "Published"}, fields=["name", "author"]):
		points.award_once(post.author, 2, points.ARTICLE_PUBLISHED, "Post", post.name)

	post_authors = dict(frappe.get_all("Post", fields=["name", "author"], as_list=True))
	comment_authors = dict(frappe.get_all("Post Comment", fields=["name", "comment_by"], as_list=True))
	for like in frappe.get_all(
		"Like", fields=["reference_doctype", "reference_name", "user"]
	):
		if like.reference_doctype == "Post":
			owner = post_authors.get(like.reference_name)
			reason = points.ARTICLE_UPVOTE
		else:
			owner = comment_authors.get(like.reference_name)
			reason = points.COMMENT_UPVOTE
		if owner:
			points.award(owner, 1, reason, like.reference_doctype, like.reference_name, actor=like.user)

	for saved in frappe.get_all("Saved Post", fields=["post", "user"]):
		owner = post_authors.get(saved.post)
		if owner:
			points.award(owner, 2, points.POST_SAVED, "Post", saved.post, actor=saved.user)

	frappe.db.commit()
