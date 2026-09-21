import io

import frappe
from frappe.model.document import Document

# Feeds only ever show cover_image at a small fixed box (see Home.vue/
# ProfilePosts.vue/PublicationDetail.vue's h-20/h-24 thumbnail classes) — full
# original uploads (easily 500KB+) were being shipped for that, dominating
# page weight even after images were made lazy-loading. cover_image's own
# doctype description already calls it "Thumbnail shown in feeds", so this
# resizes it down to what that description promises rather than adding a
# second field.
COVER_THUMBNAIL_SIZE = (480, 360)


class Post(Document):
	def before_insert(self):
		self.author = frappe.session.user
		full_name, user_image = frappe.db.get_value("User", self.author, ["full_name", "user_image"])
		self.author_name = full_name
		self.author_image = user_image

	def before_save(self):
		if self.status == "Published" and not self.published_at:
			self.published_at = frappe.utils.now_datetime()
		if self.post_type == "Image" and self.images and not self.cover_image:
			self.cover_image = self.images[0].image
		if self.cover_image and self.has_value_changed("cover_image"):
			thumbnail_url = _make_cover_thumbnail(self.cover_image, self.name)
			if thumbnail_url:
				self.cover_image = thumbnail_url

	def on_trash(self):
		_delete_comment_thread(self.name)
		frappe.db.delete("Saved Post", {"post": self.name})
		frappe.db.delete("Like", {"reference_doctype": "Post", "reference_name": self.name})
		frappe.db.set_value("Message", {"shared_post": self.name}, "shared_post", None)


def _make_cover_thumbnail(cover_image_url, post_name):
	# Best-effort: an unresizable source (an external URL not on this site's
	# own file storage, an already-deleted File record, a corrupt upload)
	# should never block saving the post — it just keeps the original
	# cover_image untouched.
	try:
		from frappe.utils.file_manager import get_file, save_file
		from PIL import Image

		filename, content = get_file(cover_image_url)
		if isinstance(content, str):
			return None

		image = Image.open(io.BytesIO(content))
		if image.mode != "RGB":
			image = image.convert("RGB")
		image.thumbnail(COVER_THUMBNAIL_SIZE, Image.Resampling.LANCZOS)

		buf = io.BytesIO()
		image.save(buf, format="JPEG", quality=82)

		base_name = filename.rsplit(".", 1)[0]
		file_doc = save_file(f"{base_name}_thumb.jpg", buf.getvalue(), "Post", post_name, is_private=0)
		return file_doc.file_url
	except Exception:
		frappe.log_error(title="Post cover thumbnail generation failed")
		return None


def _delete_comment_thread(post_name):
	# Replies link back to their parent comment, so a parent can't be deleted
	# while a reply still points to it. Repeatedly delete whatever's currently
	# a leaf (nothing else references it) until the whole thread is gone,
	# which handles any depth of nesting without needing to walk the tree.
	while True:
		leaves = frappe.db.sql(
			"""
			select name from `tabPost Comment`
			where post = %s
			and name not in (
				select distinct parent_comment from `tabPost Comment`
				where post = %s and parent_comment is not null
			)
			""",
			(post_name, post_name),
		)
		if not leaves:
			break
		for (name,) in leaves:
			frappe.delete_doc("Post Comment", name, ignore_permissions=True, force=True)


def has_permission(doc, ptype=None, user=None):
	# Only read visibility is restricted here; create/write/delete are already
	# governed by the doctype's own role + if_owner permission rules. Deciding
	# read-only matters because `author` isn't set yet at create-permission
	# time (before_insert hasn't run), so applying this to "create" would
	# incorrectly deny every new post.
	if ptype != "read":
		return True
	user = user or frappe.session.user
	if doc.status == "Published":
		return True
	return doc.author == user


def get_permission_query_conditions(user=None):
	user = user or frappe.session.user
	if user == "Administrator":
		return ""
	return f"(`tabPost`.status = 'Published' OR `tabPost`.author = {frappe.db.escape(user)})"
