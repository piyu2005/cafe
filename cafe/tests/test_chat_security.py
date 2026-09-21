"""Tests for the three security fixes made to chat.py: the SSRF guard on
link-preview fetching, the chat-attachment permission check (only actual
conversation members can view a shared image), and the fix that stops the
attachment endpoint from ever rendering a non-image file inline (which
would otherwise let a malicious attachment run script in the viewer's
session)."""

import io

import frappe
from frappe.tests import IntegrationTestCase, set_user
from PIL import Image

from cafe.chat import _is_public_http_url, download_attachment, send_message, start_dm


def _tiny_jpeg_bytes():
	# File.before_insert runs uploaded images through Pillow (to strip EXIF
	# data) before saving — a fake byte string with a .jpg name gets
	# rejected outright, same as it would via a real upload. A real, if
	# tiny, JPEG is needed to exercise the "legit image" side of these tests.
	buf = io.BytesIO()
	Image.new("RGB", (2, 2), color="red").save(buf, format="JPEG")
	return buf.getvalue()


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


class TestSsrfGuard(IntegrationTestCase):
	def test_blocks_loopback(self):
		self.assertFalse(_is_public_http_url("http://127.0.0.1/x"))
		self.assertFalse(_is_public_http_url("http://localhost/x"))

	def test_blocks_link_local_metadata_endpoint(self):
		# The classic cloud-metadata SSRF target (AWS/GCP/Azure all use this
		# address) — this is the exact address this guard exists to block.
		self.assertFalse(_is_public_http_url("http://169.254.169.254/latest/meta-data/"))

	def test_blocks_private_network_ranges(self):
		self.assertFalse(_is_public_http_url("http://10.0.0.5/"))
		self.assertFalse(_is_public_http_url("http://192.168.1.1/"))

	def test_blocks_non_http_schemes(self):
		self.assertFalse(_is_public_http_url("ftp://example.com/"))
		self.assertFalse(_is_public_http_url("file:///etc/passwd"))

	def test_allows_public_url(self):
		self.assertTrue(_is_public_http_url("http://example.com/"))
		self.assertTrue(_is_public_http_url("https://example.com/page"))


class TestChatAttachmentPermission(IntegrationTestCase):
	def setUp(self):
		self.sender = _make_user("chatsec_sender@example.com", "Sender")
		self.recipient = _make_user("chatsec_recipient@example.com", "Recipient")
		self.outsider = _make_user("chatsec_outsider@example.com", "Outsider")

		with set_user(self.sender):
			self.conversation = start_dm(self.recipient)["conversation"]
			file_doc = frappe.get_doc(
				{
					"doctype": "File",
					"file_name": "photo.jpg",
					"is_private": 1,
					"content": _tiny_jpeg_bytes(),
				}
			)
			file_doc.insert(ignore_permissions=True)
			self.file_url = file_doc.file_url
			result = send_message(
				self.conversation,
				attachments=[{"file_url": self.file_url, "file_name": "photo.jpg", "file_size": 633}],
			)
			# send_message rewrites file_url to the download_attachment proxy
			# URL in its response — the underlying File's own file_url (what
			# download_attachment actually keys off) is unchanged.
			self.assertIn("download_attachment", result["attachments"][0]["file_url"])

	def test_sender_can_view_own_attachment(self):
		with set_user(self.sender):
			# Raises on failure; reaching this line without an exception is the assertion.
			download_attachment(self.file_url)

	def test_conversation_member_can_view_attachment(self):
		with set_user(self.recipient):
			download_attachment(self.file_url)

	def test_non_member_cannot_view_attachment(self):
		with set_user(self.outsider):
			with self.assertRaises(frappe.PermissionError):
				download_attachment(self.file_url)

	def test_explicit_share_grants_access_even_without_membership(self):
		frappe.share.add_docshare(
			"File", frappe.db.get_value("File", {"file_url": self.file_url}), self.outsider, read=1
		)
		with set_user(self.outsider):
			download_attachment(self.file_url)


class TestChatAttachmentInlineRendering(IntegrationTestCase):
	"""Only real raster image types may render inline; everything else must
	force a download instead of executing same-origin in the viewer's
	browser."""

	def setUp(self):
		self.sender = _make_user("chatinline_sender@example.com", "Sender")
		self.recipient = _make_user("chatinline_recipient@example.com", "Recipient")
		with set_user(self.sender):
			self.conversation = start_dm(self.recipient)["conversation"]

	def _download_and_get_disposition(self, filename):
		# Real requests each get a fresh frappe.local.response; calling the
		# whitelisted function directly, back-to-back, doesn't — so a prior
		# call's "inline" would otherwise leak into this one's result.
		frappe.local.response = frappe._dict()
		content = _tiny_jpeg_bytes() if filename.endswith(".jpg") else b"<script>1</script>"
		with set_user(self.sender):
			file_doc = frappe.get_doc(
				{"doctype": "File", "file_name": filename, "is_private": 1, "content": content}
			)
			file_doc.insert(ignore_permissions=True)
			download_attachment(file_doc.file_url)
		return frappe.local.response.get("display_content_as")

	def test_jpg_renders_inline(self):
		disposition = self._download_and_get_disposition("safe.jpg")
		self.assertEqual(disposition, "inline")

	def test_svg_does_not_render_inline(self):
		disposition = self._download_and_get_disposition("malicious.svg")
		self.assertNotEqual(disposition, "inline")

	def test_html_does_not_render_inline(self):
		disposition = self._download_and_get_disposition("malicious.html")
		self.assertNotEqual(disposition, "inline")


class TestMentionNotificationScoping(IntegrationTestCase):
	def setUp(self):
		self.sender = _make_user("mention_sender@example.com", "Sender")
		self.recipient = _make_user("mention_recipient@example.com", "Recipient")
		self.outsider = _make_user("mention_outsider@example.com", "Outsider")
		with set_user(self.sender):
			self.conversation = start_dm(self.recipient)["conversation"]

	def _mention_span(self, user):
		return f'<span class="mention" data-type="mention" data-id="{user}">@u</span>'

	def test_mentioning_a_conversation_member_notifies_them(self):
		before = frappe.db.count("App Notification", {"recipient": self.recipient, "type": "Mention"})
		with set_user(self.sender):
			send_message(self.conversation, content=f"hey {self._mention_span(self.recipient)}")
		after = frappe.db.count("App Notification", {"recipient": self.recipient, "type": "Mention"})
		self.assertEqual(after, before + 1)

	def test_mentioning_a_non_member_does_not_notify_them(self):
		before = frappe.db.count("App Notification", {"recipient": self.outsider, "type": "Mention"})
		with set_user(self.sender):
			send_message(self.conversation, content=f"hey {self._mention_span(self.outsider)}")
		after = frappe.db.count("App Notification", {"recipient": self.outsider, "type": "Mention"})
		self.assertEqual(after, before)
