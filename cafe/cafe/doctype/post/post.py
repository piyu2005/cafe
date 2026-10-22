import io

import frappe
from frappe import _
from frappe.model.document import Document

from cafe.api import _publication_role

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
		# Not on every save - only when `publication` itself is being set or
		# changed, so losing membership later doesn't block editing a post
		# that's already assigned there.
		if self.publication and self.has_value_changed("publication"):
			if not frappe.db.exists(
				"Publication Member", {"publication": self.publication, "user": self.author}
			):
				frappe.throw(_("You're not a member of this publication"), frappe.PermissionError)

		# Publishing/unpublishing a publication's post is an Editor/Admin call -
		# a Member can write and edit their own drafts but doesn't decide what
		# goes live. A personal post (no publication) stays fully self-serve.
		if self.publication and self.has_value_changed("status"):
			before = self.get_doc_before_save()
			was_published = bool(before) and before.status == "Published"
			becomes_published = self.status == "Published"
			if was_published or becomes_published:
				if _publication_role(self.publication) not in ("Editor", "Admin"):
					frappe.throw(
						_("Only an Editor or Admin of this publication can publish or unpublish a post"),
						frappe.PermissionError,
					)

		if self.status == "Published" and not self.published_at:
			self.published_at = frappe.utils.now_datetime()
			# A published post has nothing left to schedule - stale otherwise if
			# this was scheduled and then manually published early.
			self.scheduled_at = None
			from cafe import points

			points.award_once(self.author, 2, points.ARTICLE_PUBLISHED, "Post", self.name)

			# Same "first-send only" rule as chat's own mentions (cafe/chat.py)
			# - editing a published post later doesn't re-notify or notify a
			# newly-added @mention, only the post actually going live once does.
			from cafe.chat import _extract_mentions
			from cafe.follow import _notify

			mentioned_ids = set(_extract_mentions(self.content))
			if mentioned_ids:
				valid_mentions = frappe.db.get_all(
					"User", filters={"name": ["in", list(mentioned_ids)], "enabled": 1}, pluck="name"
				)
				for user in valid_mentions:
					_notify(
						recipient=user,
						actor=self.author,
						notif_type="Mention",
						message="mentioned you in a post",
						reference_doctype="Post",
						reference_name=self.name,
					)
		if self.post_type == "Image" and self.images and not self.cover_image:
			self.cover_image = self.images[0].image
		if self.cover_image and self.has_value_changed("cover_image"):
			thumbnail_url = _make_cover_thumbnail(self.cover_image, self.name)
			if thumbnail_url:
				self.cover_image = thumbnail_url

	def on_trash(self):
		# Collected before _delete_comment_thread runs - afterwards there's
		# nothing left with this post, name to find them by.
		comment_names = frappe.get_all("Post Comment", filters={"post": self.name}, pluck="name")
		_delete_comment_thread(self.name)
		frappe.db.delete("Saved Post", {"post": self.name})
		frappe.db.delete("Repost", {"post": self.name})
		frappe.db.delete("Like", {"reference_doctype": "Post", "reference_name": self.name})
		if comment_names:
			frappe.db.delete(
				"Like", {"reference_doctype": "Post Comment", "reference_name": ["in", comment_names]}
			)
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
	# "create" falls through to True below: `author`/`publication` aren't set
	# yet at create-permission time (before_insert hasn't run), so deciding
	# anything here for "create" would incorrectly deny every new post.
	user = user or frappe.session.user
	if ptype == "read":
		if doc.status == "Published":
			return True
		if doc.author == user:
			return True
		return bool(doc.publication) and _publication_role(doc.publication, user) in ("Editor", "Admin")
	if ptype in ("write", "delete"):
		# The doctype's own permission rules grant "All" unconditional write/
		# delete (see post.json - there's no if_owner any more, this is the
		# only gate): the author always keeps it; otherwise only an Editor or
		# Admin of the post's publication does, same reasoning as before_save's
		# publish/unpublish check - a Member can manage their own drafts but
		# isn't a gatekeeper for anyone else's.
		if doc.author == user:
			return True
		return bool(doc.publication) and _publication_role(doc.publication, user) in ("Editor", "Admin")
	return True


def get_permission_query_conditions(user=None):
	user = user or frappe.session.user
	if user == "Administrator":
		return ""
	return f"(`tabPost`.status = 'Published' OR `tabPost`.author = {frappe.db.escape(user)})"


def publish_due_posts():
	"""Scheduler entry (scheduler_events["all"] in hooks.py, so about every few
	minutes): publish every draft whose scheduled time has come, as its own
	author, so the usual publish-time checks (publication role, etc.) run as
	them, not as whoever's running the scheduler. A draft that can't publish -
	lost publication access, anything else - keeps its content, loses its
	scheduled time, and shows back up as a plain draft, with the reason in the
	Error Log. Mirrors Gameplan's own publish_due_drafts (gp_draft.py)."""
	due = frappe.get_all(
		"Post",
		filters=[
			["status", "=", "Draft"],
			["scheduled_at", "is", "set"],
			["scheduled_at", "<=", frappe.utils.now_datetime()],
		],
		fields=["name", "author"],
		order_by="scheduled_at asc",
	)
	for row in due:
		# so the publish-time checks (publication role, etc.) run as the
		# post's own author, not whoever's running the scheduler; always
		# reset to Administrator below, in `finally`
		frappe.set_user(row.author)  # nosemgrep: frappe-setuser
		frappe.db.savepoint("scheduled_post")
		try:
			scheduled_at = frappe.db.get_value("Post", row.name, "scheduled_at", for_update=True)
			if not scheduled_at or frappe.utils.get_datetime(scheduled_at) > frappe.utils.now_datetime():
				continue
			doc = frappe.get_doc("Post", row.name)
			doc.status = "Published"
			doc.save()
		except Exception:
			frappe.db.rollback(save_point="scheduled_post")
			frappe.log_error(title=f"Scheduled post {row.name} could not be published")
			frappe.db.set_value("Post", row.name, "scheduled_at", None, update_modified=False)
		finally:
			frappe.set_user("Administrator")  # nosemgrep: frappe-setuser (reverting the switch above)
