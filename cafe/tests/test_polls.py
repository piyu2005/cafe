"""Tests for chat polls: Poll Option is a child table of Poll (converted
from a standalone doctype - see patches/v1_0/convert_poll_option_to_child_
table.py for why and how existing data was migrated), so these cover both
the everyday voting behavior and that the child-table relationship itself
actually works (options save atomically with their poll, and are reachable
both via the parent doc and via a direct Poll Option query)."""

import frappe
from frappe.tests import IntegrationTestCase, set_user

from cafe.chat import _poll_payload, create_poll, start_dm, toggle_poll_vote


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


class TestCreatePoll(IntegrationTestCase):
	def setUp(self):
		self.a = _make_user("poll_a@example.com", "A")
		self.b = _make_user("poll_b@example.com", "B")
		with set_user(self.a):
			self.conversation = start_dm(self.b)["conversation"]

	def test_options_are_saved_as_children_in_the_given_order(self):
		with set_user(self.a):
			result = create_poll(
				conversation=self.conversation, question="Favorite color?", options=["Red", "Green", "Blue"]
			)
		poll_name = result["poll"]

		# Reachable via the parent document...
		poll_doc = frappe.get_doc("Poll", poll_name)
		self.assertEqual([o.option_text for o in poll_doc.options], ["Red", "Green", "Blue"])

		# ...and via a direct query on the child doctype, parented correctly.
		rows = frappe.get_all(
			"Poll Option", filters={"parent": poll_name}, fields=["option_text"], order_by="idx asc"
		)
		self.assertEqual([r.option_text for r in rows], ["Red", "Green", "Blue"])

	def test_requires_at_least_two_options(self):
		with set_user(self.a):
			with self.assertRaises(frappe.ValidationError):
				create_poll(conversation=self.conversation, question="Only one?", options=["Just this"])

	def test_requires_a_question(self):
		with set_user(self.a):
			with self.assertRaises(frappe.ValidationError):
				create_poll(conversation=self.conversation, question="  ", options=["A", "B"])


class TestTogglePollVote(IntegrationTestCase):
	def setUp(self):
		self.a = _make_user("pollvote_a@example.com", "A")
		self.b = _make_user("pollvote_b@example.com", "B")
		with set_user(self.a):
			self.conversation = start_dm(self.b)["conversation"]
			result = create_poll(
				conversation=self.conversation,
				question="Favorite color?",
				options=["Red", "Green", "Blue"],
				allow_multiple=0,
			)
		self.poll_name = result["poll"]
		options = frappe.get_all(
			"Poll Option",
			filters={"parent": self.poll_name},
			fields=["name", "option_text"],
			order_by="idx asc",
		)
		self.red, self.green, self.blue = (o.name for o in options)

	def _counts(self, payload):
		return {o["name"]: o["vote_count"] for o in payload["options"]}

	def test_voting_increments_the_chosen_options_count(self):
		with set_user(self.b):
			result = toggle_poll_vote(self.red)
		self.assertEqual(self._counts(result)[self.red], 1)
		self.assertEqual(result["total_votes"], 1)

	def test_voting_a_second_option_moves_the_vote_when_not_allow_multiple(self):
		with set_user(self.b):
			toggle_poll_vote(self.red)
			result = toggle_poll_vote(self.green)
		counts = self._counts(result)
		self.assertEqual(counts[self.red], 0)
		self.assertEqual(counts[self.green], 1)
		self.assertEqual(result["total_votes"], 1)

	def test_toggling_the_same_option_again_removes_the_vote(self):
		with set_user(self.b):
			toggle_poll_vote(self.red)
			result = toggle_poll_vote(self.red)
		self.assertEqual(self._counts(result)[self.red], 0)
		self.assertEqual(result["total_votes"], 0)

	def test_votes_from_different_users_are_independent(self):
		with set_user(self.a):
			toggle_poll_vote(self.red)
		with set_user(self.b):
			result = toggle_poll_vote(self.green)
		counts = self._counts(result)
		self.assertEqual(counts[self.red], 1)
		self.assertEqual(counts[self.green], 1)
		self.assertEqual(result["total_votes"], 2)

	def test_non_member_cannot_vote(self):
		outsider = _make_user("pollvote_outsider@example.com", "Outsider")
		with set_user(outsider):
			with self.assertRaises(frappe.PermissionError):
				toggle_poll_vote(self.red)


class TestPollPayload(IntegrationTestCase):
	def test_missing_poll_returns_none(self):
		self.assertIsNone(_poll_payload("not-a-real-poll-name"))
