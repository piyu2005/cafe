import re

import frappe

from cafe.cafe.doctype.post.post import _make_cover_thumbnail

PRIVATE_FILE_URL = re.compile(r"/private/files/[^\"'\s]+")


def execute():
	"""Posts saved before the upload-privacy fix have images baked in as
	literal /private/files/... URLs - a private file only ever serves back
	to its own uploader, so these were broken for every other reader,
	including guests. Backfills every such reference in place: content's
	inline images and the images child table (Image-post carousel slides)
	each get a fresh public copy of their File via _make_public() below;
	cover_image gets the same treatment _make_cover_thumbnail already gives
	every new save, which regenerates a fresh public thumbnail from the
	private original.

	Deliberately scoped to Post.content/cover_image/images only - a chat
	attachment's own private upload (chat_composer.js) is correct as-is and
	must not be touched by this."""
	_fix_content_images()
	_fix_cover_images()
	_fix_carousel_images()
	frappe.db.commit()


def _make_public(file_url, post_name):
	"""Returns a public file_url for `file_url` - the same one, unchanged, if
	it's already public; otherwise a freshly created public copy of it. None
	if it couldn't be found/read - callers skip that reference rather than
	fail the whole post.

	Deliberately copies rather than flipping the existing File's is_private
	in place (File.handle_is_private_changed, which just renames the file on
	disk): that throws FileExistsError whenever a public file already
	happens to occupy the target filename - a real, observed collision, not
	a hypothetical one. save_file() has no such problem; it already
	uniquifies the name on any collision, the same way a fresh upload would.
	The old private file is left in place, unreferenced - harmless, and
	safer than trying to figure out whether anything else might still point
	at it before deleting it."""
	try:
		file_doc = frappe.get_doc("File", {"file_url": file_url})
	except frappe.DoesNotExistError:
		frappe.log_error(title="fix_private_post_images: File not found", message=file_url)
		return None
	if not file_doc.is_private:
		return file_doc.file_url
	try:
		from frappe.utils.file_manager import get_file, save_file

		filename, content = get_file(file_doc.file_url)
		if isinstance(content, str):
			content = content.encode()
		new_file = save_file(filename, content, "Post", post_name, is_private=0)
		return new_file.file_url
	except Exception:
		frappe.log_error(
			title="fix_private_post_images: failed to make file public", message=frappe.get_traceback()
		)
		return None


def _fix_content_images():
	posts = frappe.get_all(
		"Post",
		filters={"content": ["like", "%/private/files/%"]},
		fields=["name", "content"],
	)
	for post in posts:
		content = post.content or ""
		urls = set(PRIVATE_FILE_URL.findall(content))
		for old_url in urls:
			new_url = _make_public(old_url, post.name)
			if new_url:
				content = content.replace(old_url, new_url)
		if content != post.content:
			frappe.db.set_value("Post", post.name, "content", content, update_modified=False)


def _fix_cover_images():
	posts = frappe.get_all(
		"Post",
		filters={"cover_image": ["like", "/private/files/%"]},
		fields=["name", "cover_image"],
	)
	for post in posts:
		thumbnail_url = _make_cover_thumbnail(post.cover_image, post.name)
		if thumbnail_url:
			frappe.db.set_value("Post", post.name, "cover_image", thumbnail_url, update_modified=False)


def _fix_carousel_images():
	rows = frappe.get_all(
		"Post Image",
		filters={"image": ["like", "/private/files/%"], "parenttype": "Post"},
		fields=["name", "image", "parent"],
	)
	for row in rows:
		new_url = _make_public(row.image, row.parent)
		if new_url:
			frappe.db.set_value("Post Image", row.name, "image", new_url, update_modified=False)
