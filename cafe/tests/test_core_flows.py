"""End-to-end checks for the everyday social flows: creating a post, liking
it, commenting on it, and saving it. These exercise the normal path a real
user takes, as opposed to test_permissions.py (who's allowed to do what) or
test_chat_security.py (the chat-specific security fixes)."""

import frappe
from frappe.tests import IntegrationTestCase, set_user

from cafe.api import (
	add_comment,
	delete_comment,
	list_saved_posts,
	toggle_like,
	toggle_save_post,
)


def _make_user(email, first_name):
	if not frappe.db.exists("User", email):
		frappe.get_doc(
			{
				"doctype": "User",
				"email": email,
				"first_name": first_name,
				"send_welcome_email": 0,
				"user_type": "Website User",
			}
		).insert(ignore_permissions=True)
	return email


def _make_post(author, status="Published"):
	with set_user(author):
		doc = frappe.get_doc(
			{"doctype": "Post", "content": "<p>hello</p>", "status": status, "post_type": "Blog"}
		)
		doc.insert(ignore_permissions=True)
		return doc.name


class TestPostCreation(IntegrationTestCase):
	def setUp(self):
		self.author = _make_user("core_author@example.com", "Author")

	def test_creating_a_post_sets_author_fields(self):
		with set_user(self.author):
			doc = frappe.get_doc({"doctype": "Post", "content": "<p>hi</p>", "post_type": "Blog"})
			doc.insert(ignore_permissions=True)
		self.assertEqual(doc.author, self.author)
		self.assertEqual(doc.author_name, frappe.db.get_value("User", self.author, "full_name"))

	def test_publishing_sets_published_at(self):
		with set_user(self.author):
			doc = frappe.get_doc(
				{"doctype": "Post", "content": "<p>hi</p>", "post_type": "Blog", "status": "Published"}
			)
			doc.insert(ignore_permissions=True)
		self.assertIsNotNone(doc.published_at)


class TestLikeFlow(IntegrationTestCase):
	def setUp(self):
		self.author = _make_user("core_like_author@example.com", "Author")
		self.liker = _make_user("core_like_liker@example.com", "Liker")
		self.post = _make_post(self.author)

	def test_liking_a_post_increments_count_and_toggling_again_removes_it(self):
		with set_user(self.liker):
			result = toggle_like("Post", self.post)
			self.assertTrue(result["liked"])
			self.assertEqual(result["count"], 1)

			result = toggle_like("Post", self.post)
			self.assertFalse(result["liked"])
			self.assertEqual(result["count"], 0)

	def test_liking_a_post_notifies_the_author(self):
		before = frappe.db.count("App Notification", {"recipient": self.author, "type": "Like"})
		with set_user(self.liker):
			toggle_like("Post", self.post)
		after = frappe.db.count("App Notification", {"recipient": self.author, "type": "Like"})
		self.assertEqual(after, before + 1)

	def test_liking_own_post_does_not_self_notify(self):
		before = frappe.db.count("App Notification", {"recipient": self.author, "type": "Like"})
		with set_user(self.author):
			toggle_like("Post", self.post)
		after = frappe.db.count("App Notification", {"recipient": self.author, "type": "Like"})
		self.assertEqual(after, before)


class TestCommentFlow(IntegrationTestCase):
	def setUp(self):
		self.author = _make_user("core_comment_author@example.com", "Author")
		self.commenter = _make_user("core_comment_commenter@example.com", "Commenter")
		self.post = _make_post(self.author)

	def test_add_comment_notifies_post_author(self):
		before = frappe.db.count("App Notification", {"recipient": self.author, "type": "Comment"})
		with set_user(self.commenter):
			comment = add_comment(self.post, "nice post")
		after = frappe.db.count("App Notification", {"recipient": self.author, "type": "Comment"})
		self.assertEqual(after, before + 1)
		self.assertEqual(comment["comment_by"], self.commenter)

	def test_only_comment_author_can_delete_their_comment(self):
		with set_user(self.commenter):
			comment = add_comment(self.post, "nice post")
		with set_user(self.author):
			with self.assertRaises(frappe.PermissionError):
				delete_comment(comment["name"])
		self.assertTrue(frappe.db.exists("Post Comment", comment["name"]))

	def test_deleting_a_top_level_comment_deletes_its_replies(self):
		with set_user(self.commenter):
			top = add_comment(self.post, "top level")
		with set_user(self.author):
			reply = add_comment(self.post, "a reply", parent_comment=top["name"])
		with set_user(self.commenter):
			delete_comment(top["name"])
		self.assertFalse(frappe.db.exists("Post Comment", top["name"]))
		self.assertFalse(frappe.db.exists("Post Comment", reply["name"]))


class TestSavePostFlow(IntegrationTestCase):
	def setUp(self):
		self.author = _make_user("core_save_author@example.com", "Author")
		self.saver = _make_user("core_save_saver@example.com", "Saver")
		self.post = _make_post(self.author)

	def test_saving_and_unsaving_a_post(self):
		with set_user(self.saver):
			result = toggle_save_post(self.post)
			self.assertTrue(result["saved"])
			self.assertIn(self.post, [p["name"] for p in list_saved_posts()])

			result = toggle_save_post(self.post)
			self.assertFalse(result["saved"])
			self.assertNotIn(self.post, [p["name"] for p in list_saved_posts()])
