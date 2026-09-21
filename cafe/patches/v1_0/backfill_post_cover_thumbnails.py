import frappe

from cafe.cafe.doctype.post.post import _make_cover_thumbnail


def execute():
	# Posts saved before the thumbnailing fix are still carrying their full-
	# resolution original as cover_image (some 500KB+) despite it only ever
	# being shown as a small feed thumbnail. Backfill those in place, the
	# same way before_save now handles it for every future save.
	posts = frappe.get_all(
		"Post",
		filters={"cover_image": ["is", "set"]},
		fields=["name", "cover_image"],
	)
	for post in posts:
		if "_thumb" in (post.cover_image or ""):
			continue
		thumbnail_url = _make_cover_thumbnail(post.cover_image, post.name)
		if thumbnail_url:
			frappe.db.set_value("Post", post.name, "cover_image", thumbnail_url, update_modified=False)
	frappe.db.commit()
