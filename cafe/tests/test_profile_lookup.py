"""Profile URLs use the username. The lookup also accepts an email, so links
shared before this change keep working."""

import frappe
from frappe.tests import IntegrationTestCase, set_user

from cafe.api import get_post, get_profile, list_profile_posts


def _make_user(email, first_name, username):
	if not frappe.db.exists("User", email):
		frappe.get_doc(
			{
				"doctype": "User",
				"email": email,
				"first_name": first_name,
				"username": username,
				"send_welcome_email": 0,
				"user_type": "Website User",
			}
		).insert(ignore_permissions=True)
	return email


class TestProfileLookup(IntegrationTestCase):
	def setUp(self):
		self.viewer = _make_user("lookup_viewer@example.com", "Viewer", "lookupviewer")
		self.author = _make_user("lookup_author@example.com", "Author", "lookupauthor")
		with set_user(self.author):
			self.post_name = (
				frappe.get_doc(
					{"doctype": "Post", "content": "<p>hi</p>", "status": "Published", "post_type": "Blog"}
				)
				.insert(ignore_permissions=True)
				.name
			)

	def test_profile_by_username(self):
		with set_user(self.viewer):
			profile = get_profile("lookupauthor")
		self.assertEqual(profile.name, self.author)

	def test_profile_by_email_still_works(self):
		with set_user(self.viewer):
			profile = get_profile(self.author)
		self.assertEqual(profile.username, "lookupauthor")

	def test_no_id_means_the_caller(self):
		with set_user(self.viewer):
			self.assertEqual(get_profile().name, self.viewer)

	def test_unknown_username_is_an_error(self):
		with set_user(self.viewer):
			with self.assertRaises(frappe.ValidationError):
				get_profile("nobody_has_this_username")

	def test_posts_by_username(self):
		with set_user(self.viewer):
			posts = list_profile_posts("lookupauthor")
		self.assertTrue(any(p.name == self.post_name for p in posts))

	def test_post_returns_the_author_username(self):
		with set_user(self.viewer):
			post = get_post(self.post_name)
		self.assertEqual(post.author_username, "lookupauthor")
