"""Tests for reply/edit/delete on chat messages: ownership boundaries
(only a message's own sender can edit or delete it), the reply-to preview
not leaking another conversation's content, and a deleted message's
attachment/content actually becoming unreachable rather than just hidden
client-side."""

import io

import frappe
from frappe.tests import IntegrationTestCase, set_user
from PIL import Image

from cafe.chat import (
	delete_message,
	download_attachment,
	edit_message,
	get_messages,
	list_conversations,
	send_message,
	start_dm,
)


def _tiny_jpeg_bytes():
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


class TestReplyPreview(IntegrationTestCase):
	def setUp(self):
		self.a = _make_user("chatmsg_a@example.com", "A")
		self.b = _make_user("chatmsg_b@example.com", "B")
		with set_user(self.a):
			self.conversation = start_dm(self.b)["conversation"]

	def test_reply_carries_a_preview_of_the_original(self):
		with set_user(self.a):
			original = send_message(self.conversation, content="Original message")
			reply = send_message(self.conversation, content="Replying", reply_to=original["name"])
		self.assertEqual(reply["reply_to_preview"]["sender_name"], "A")
		self.assertEqual(reply["reply_to_preview"]["content"], "Original message")

	def test_reply_preview_reflects_a_later_edit_of_the_original(self):
		with set_user(self.a):
			original = send_message(self.conversation, content="Original message")
			reply = send_message(self.conversation, content="Replying", reply_to=original["name"])
			edit_message(original["name"], "Edited content")
			messages = get_messages(self.conversation)
		updated_reply = next(m for m in messages if m.name == reply["name"])
		self.assertEqual(updated_reply.reply_to_preview["content"], "Edited content")

	def test_cannot_reply_to_a_message_in_a_different_conversation(self):
		with set_user(self.a):
			other_conversation_msg = send_message(self.conversation, content="lives in conversation A")
		c = _make_user("chatmsg_c@example.com", "C")
		with set_user(c):
			with self.assertRaises(frappe.PermissionError):
				send_message(
					start_dm(self.a)["conversation"],
					content="sneaky",
					reply_to=other_conversation_msg["name"],
				)


class TestEditMessage(IntegrationTestCase):
	def setUp(self):
		self.a = _make_user("chatmsg_edit_a@example.com", "A")
		self.b = _make_user("chatmsg_edit_b@example.com", "B")
		with set_user(self.a):
			self.conversation = start_dm(self.b)["conversation"]
			self.message = send_message(self.conversation, content="Original")["name"]

	def test_sender_can_edit_their_own_message(self):
		with set_user(self.a):
			result = edit_message(self.message, "Updated")
		self.assertEqual(result["content"], "Updated")
		self.assertEqual(result["is_edited"], 1)
		self.assertEqual(frappe.db.get_value("Message", self.message, "content"), "Updated")

	def test_other_member_cannot_edit_someone_elses_message(self):
		with set_user(self.b):
			with self.assertRaises(frappe.PermissionError):
				edit_message(self.message, "hacked")
		self.assertEqual(frappe.db.get_value("Message", self.message, "content"), "Original")

	def test_cannot_edit_a_deleted_message(self):
		with set_user(self.a):
			delete_message(self.message)
			with self.assertRaises(frappe.ValidationError):
				edit_message(self.message, "resurrect me")


class TestDeleteMessage(IntegrationTestCase):
	def setUp(self):
		self.a = _make_user("chatmsg_del_a@example.com", "A")
		self.b = _make_user("chatmsg_del_b@example.com", "B")
		with set_user(self.a):
			self.conversation = start_dm(self.b)["conversation"]
			self.message = send_message(self.conversation, content="Original")["name"]

	def test_sender_can_delete_their_own_message(self):
		with set_user(self.a):
			delete_message(self.message)
		self.assertEqual(frappe.db.get_value("Message", self.message, "is_deleted"), 1)
		# Row stays (so reply_to references elsewhere still resolve) - only
		# the content is scrubbed from what's actually served back out.
		self.assertTrue(frappe.db.exists("Message", self.message))

	def test_other_member_cannot_delete_someone_elses_message(self):
		with set_user(self.b):
			with self.assertRaises(frappe.PermissionError):
				delete_message(self.message)
		self.assertEqual(frappe.db.get_value("Message", self.message, "is_deleted"), 0)

	def test_deleted_message_content_is_scrubbed_from_history(self):
		with set_user(self.a):
			delete_message(self.message)
		with set_user(self.b):
			messages = get_messages(self.conversation)
		deleted = next(m for m in messages if m.name == self.message)
		self.assertIsNone(deleted.content)
		self.assertEqual(deleted.is_deleted, 1)

	def test_conversation_list_shows_deleted_placeholder_for_last_message(self):
		with set_user(self.a):
			delete_message(self.message)
			conversations = list_conversations()
		conv = next(c for c in conversations if c["conversation"] == self.conversation)
		self.assertEqual(conv["last_message"], "This message was deleted")

	def test_deleted_messages_attachment_becomes_unreachable(self):
		with set_user(self.a):
			file_doc = frappe.get_doc(
				{"doctype": "File", "file_name": "photo.jpg", "is_private": 1, "content": _tiny_jpeg_bytes()}
			)
			file_doc.insert(ignore_permissions=True)
			message = send_message(
				self.conversation,
				attachments=[{"file_url": file_doc.file_url, "file_name": "photo.jpg", "file_size": 633}],
			)["name"]

		with set_user(self.b):
			download_attachment(file_doc.file_url)  # should not raise

		with set_user(self.a):
			delete_message(message)

		with set_user(self.b):
			with self.assertRaises(frappe.DoesNotExistError):
				download_attachment(file_doc.file_url)
