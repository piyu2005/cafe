"""Message requests: a first DM to someone always starts life as Pending on
the recipient's own Conversation Member row - hidden from their main
conversation list until they explicitly accept, or implicitly accept by
replying. The sender's own row is always Accepted, so they see the
conversation normally regardless of the recipient's decision."""

import frappe
from frappe.tests import IntegrationTestCase, set_user

from cafe.chat import (
	create_poll,
	list_conversations,
	list_message_requests,
	respond_to_message_request,
	send_message,
	start_dm,
	unread_message_count,
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


def _unique_pair(prefix):
	# start_dm dedups to the same existing conversation for the same two
	# users - and IntegrationTestCase's rollback is class-scoped, not
	# per-test, so setUp() reruns before every test method in a class (same
	# gotcha documented elsewhere in this test suite). Reusing one hardcoded
	# email pair across a class's tests would mean each test's start_dm just
	# returns the PREVIOUS test's already-mutated conversation instead of a
	# fresh one. A unique suffix per setUp() call sidesteps that.
	unique = frappe.generate_hash(length=8)
	sender = _make_user(f"{prefix}_sender_{unique}@example.com", "Sender")
	recipient = _make_user(f"{prefix}_recipient_{unique}@example.com", "Recipient")
	return sender, recipient


def _member_status(conversation, user):
	return frappe.db.get_value("Conversation Member", {"conversation": conversation, "user": user}, "status")


class TestMessageRequestCreation(IntegrationTestCase):
	def setUp(self):
		self.sender, self.recipient = _unique_pair("msgreq_create")

	def test_first_dm_is_pending_for_the_recipient(self):
		with set_user(self.sender):
			conv = start_dm(self.recipient)["conversation"]
		self.assertEqual(_member_status(conv, self.recipient), "Pending")
		self.assertEqual(_member_status(conv, self.sender), "Accepted")


class TestMessageRequestVisibility(IntegrationTestCase):
	def setUp(self):
		self.sender, self.recipient = _unique_pair("msgreq_vis")
		with set_user(self.sender):
			self.conv = start_dm(self.recipient)["conversation"]
			send_message(self.conv, content="hi there")

	def test_pending_conversation_is_hidden_from_recipients_main_list(self):
		with set_user(self.recipient):
			names = [c["conversation"] for c in list_conversations()]
		self.assertNotIn(self.conv, names)

	def test_pending_conversation_appears_in_recipients_requests(self):
		with set_user(self.recipient):
			names = [c["conversation"] for c in list_message_requests()]
		self.assertIn(self.conv, names)

	def test_pending_conversation_still_shows_normally_for_the_sender(self):
		with set_user(self.sender):
			names = [c["conversation"] for c in list_conversations()]
		self.assertIn(self.conv, names)

	def test_pending_message_does_not_count_toward_unread_badge(self):
		with set_user(self.recipient):
			self.assertEqual(unread_message_count(), 0)


class TestMessageRequestResponses(IntegrationTestCase):
	def setUp(self):
		self.sender, self.recipient = _unique_pair("msgreq_resp")
		with set_user(self.sender):
			self.conv = start_dm(self.recipient)["conversation"]
			send_message(self.conv, content="hi there")

	def test_accepting_moves_it_into_the_main_list(self):
		with set_user(self.recipient):
			respond_to_message_request(self.conv, 1)
			names = [c["conversation"] for c in list_conversations()]
		self.assertIn(self.conv, names)
		self.assertEqual(_member_status(self.conv, self.recipient), "Accepted")

	def test_declining_removes_it_from_both_lists(self):
		with set_user(self.recipient):
			respond_to_message_request(self.conv, 0)
			main_names = [c["conversation"] for c in list_conversations()]
			request_names = [c["conversation"] for c in list_message_requests()]
		self.assertNotIn(self.conv, main_names)
		self.assertNotIn(self.conv, request_names)

	def test_replying_implicitly_accepts(self):
		with set_user(self.recipient):
			send_message(self.conv, content="hello back")
		self.assertEqual(_member_status(self.conv, self.recipient), "Accepted")

	def test_replying_with_a_poll_implicitly_accepts(self):
		with set_user(self.recipient):
			create_poll(self.conv, question="Pick one", options=["A", "B"])
		self.assertEqual(_member_status(self.conv, self.recipient), "Accepted")

	def test_only_the_caller_can_respond_to_their_own_request(self):
		with set_user(self.sender):
			respond_to_message_request(self.conv, 1)
		# Sender's own row was already Accepted - this must not have touched
		# the recipient's still-Pending row.
		self.assertEqual(_member_status(self.conv, self.recipient), "Pending")
