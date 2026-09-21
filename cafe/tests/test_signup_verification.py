"""Tests for the email-verification signup flow: send_signup_code() no
longer creates a User immediately - without this, anyone could type in
someone else's real email address and be signed up instantly as "them",
with nothing ever confirming they actually own that inbox. The submitted
username sits behind a one-time 6-digit code instead, and only
verify_signup_code() (what the emailed code proves) actually creates the
account - passwordless throughout, so there's no password to seed either.
Covers the flow's real security property plus the usual expiry/replay/race
edge cases."""

from unittest.mock import patch

import frappe
from frappe.tests import IntegrationTestCase, set_user

from cafe.api import (
	CODE_MAX_ATTEMPTS,
	DEV_SHORTCUT_CODE,
	SIGNUP_CODE_CACHE_PREFIX,
	send_signup_code,
	verify_signup_code,
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


class TestSendSignupCode(IntegrationTestCase):
	# Duplicate checks happen before anything touches the cache or tries to
	# send mail, so these don't need an Email Account configured to test.

	def test_rejects_duplicate_email(self):
		existing = _make_user("signup_dup_email@example.com", "Dup")
		with set_user("Guest"):
			with self.assertRaises(frappe.ValidationError):
				send_signup_code(email=existing, username="somethingbrandnew")

	def test_rejects_duplicate_username(self):
		taken_user = _make_user("signup_dup_username@example.com", "Dup")
		frappe.db.set_value("User", taken_user, "username", "signuptakenname")
		with set_user("Guest"):
			with self.assertRaises(frappe.ValidationError):
				send_signup_code(email="signup_fresh_email@example.com", username="signuptakenname")

	@patch("frappe.sendmail")
	def test_caches_a_code_for_a_new_signup(self, mock_sendmail):
		# Actually sending mail is frappe core's own tested responsibility,
		# not this function's - and CI has no outgoing Email Account
		# configured, so a real frappe.sendmail() call here would fail with
		# OutgoingEmailError regardless of whether the caching logic below is
		# correct. Mocked out so this test isolates what send_signup_code()
		# itself is responsible for.
		email = "signup_fresh_send@example.com"
		with set_user("Guest"):
			send_signup_code(email=email, username="freshsignupuser")
		mock_sendmail.assert_called_once()
		cached = frappe.parse_json(frappe.cache.get_value(f"{SIGNUP_CODE_CACHE_PREFIX}{email}"))
		self.assertEqual(len(cached["code"]), 6)
		self.assertEqual(cached["username"], "freshsignupuser")
		self.assertEqual(cached["attempts"], 0)


class TestVerifySignupCode(IntegrationTestCase):
	def setUp(self):
		# Unique per test method - IntegrationTestCase's rollback is
		# class-scoped, not per-test (a documented gotcha elsewhere in this
		# app's test suite too), so a literal email/username shared across
		# every test in this class would have the first test that actually
		# creates the User "poison" every test after it.
		unique = frappe.generate_hash(length=8)
		self.code = "123456"
		self.email = f"verify_flow_{unique}@example.com"
		self.username = f"verifyflow{unique}"

		# verify_signup_code() ends by calling LoginManager(), which needs a
		# full WSGI request context (cookie manager, session machinery, etc.)
		# that only exists for a real HTTP call - confirmed separately via
		# curl that the actual login step works correctly there. Reproducing
		# that whole stack here just to satisfy it would mean re-testing
		# frappe's own login machinery rather than this feature's logic, so
		# the login step is mocked out; everything verify_signup_code()
		# itself is responsible for (creating the user, cleaning up the
		# code, re-checking uniqueness) still runs for real and is asserted
		# below.
		login_manager_patcher = patch("cafe.api.LoginManager")
		self.mock_login_manager = login_manager_patcher.start()
		self.addCleanup(login_manager_patcher.stop)

	def _seed_pending_signup(self, **overrides):
		payload = {"code": self.code, "username": self.username, "attempts": 0}
		payload.update(overrides)
		frappe.cache.set_value(
			f"{SIGNUP_CODE_CACHE_PREFIX}{self.email}", frappe.as_json(payload), expires_in_sec=600
		)

	def test_valid_code_creates_and_enables_the_user_with_no_password(self):
		self._seed_pending_signup()
		with set_user("Guest"):
			verify_signup_code(email=self.email, code=self.code)
		self.assertTrue(frappe.db.exists("User", self.email))
		self.assertEqual(frappe.db.get_value("User", self.email, "enabled"), 1)
		user = frappe.get_doc("User", self.email)
		self.assertFalse(user.get_password(raise_exception=False))
		# The whole point: the code is consumed, so nobody can replay it to
		# re-run the flow against a different/later state.
		self.assertIsNone(frappe.cache.get_value(f"{SIGNUP_CODE_CACHE_PREFIX}{self.email}"))
		self.mock_login_manager.return_value.login_as.assert_called_once_with(self.email)

	def _set_developer_mode(self, value):
		original = frappe.conf.get("developer_mode")
		frappe.conf.developer_mode = value
		self.addCleanup(lambda: frappe.conf.__setitem__("developer_mode", original))

	def test_dev_shortcut_code_works_when_developer_mode_is_on(self):
		self._seed_pending_signup()
		self._set_developer_mode(1)
		with set_user("Guest"):
			verify_signup_code(email=self.email, code=DEV_SHORTCUT_CODE)
		self.assertTrue(frappe.db.exists("User", self.email))
		self.mock_login_manager.return_value.login_as.assert_called_once_with(self.email)

	def test_dev_shortcut_code_is_rejected_when_developer_mode_is_off(self):
		# developer_mode being off (the default, and what any real hosted
		# site should have) means the shortcut is just another wrong code.
		self._seed_pending_signup()
		self._set_developer_mode(0)
		with set_user("Guest"):
			with self.assertRaises(frappe.ValidationError):
				verify_signup_code(email=self.email, code=DEV_SHORTCUT_CODE)
		self.assertFalse(frappe.db.exists("User", self.email))

	def test_valid_code_is_single_use(self):
		self._seed_pending_signup()
		with set_user("Guest"):
			verify_signup_code(email=self.email, code=self.code)
			with self.assertRaises(frappe.ValidationError):
				verify_signup_code(email=self.email, code=self.code)

	def test_no_pending_code_is_rejected(self):
		with set_user("Guest"):
			with self.assertRaises(frappe.ValidationError):
				verify_signup_code(email=self.email, code="111111")
		self.assertFalse(frappe.db.exists("User", self.email))

	def test_wrong_code_does_not_create_a_user_and_counts_as_an_attempt(self):
		self._seed_pending_signup()
		with set_user("Guest"):
			with self.assertRaises(frappe.ValidationError):
				verify_signup_code(email=self.email, code="111111")
		self.assertFalse(frappe.db.exists("User", self.email))
		cached = frappe.parse_json(frappe.cache.get_value(f"{SIGNUP_CODE_CACHE_PREFIX}{self.email}"))
		self.assertEqual(cached["attempts"], 1)

	def test_too_many_wrong_attempts_invalidates_the_code(self):
		self._seed_pending_signup(attempts=CODE_MAX_ATTEMPTS)
		with set_user("Guest"):
			with self.assertRaises(frappe.ValidationError):
				verify_signup_code(email=self.email, code=self.code)
		self.assertIsNone(frappe.cache.get_value(f"{SIGNUP_CODE_CACHE_PREFIX}{self.email}"))

	def test_email_taken_while_pending_is_caught_at_verify_time(self):
		self._seed_pending_signup()
		# Someone else claims the same email through a separate signup while
		# this code sits unused - re-checked at verify time rather than
		# trusting the check already done (and now stale) at send time.
		_make_user(self.email, "SomeoneElse")
		with set_user("Guest"):
			with self.assertRaises(frappe.ValidationError):
				verify_signup_code(email=self.email, code=self.code)

	def test_username_taken_while_pending_is_caught_at_verify_time(self):
		self._seed_pending_signup()
		other = _make_user("verify_someone_else@example.com", "SomeoneElse")
		frappe.db.set_value("User", other, "username", self.username)
		with set_user("Guest"):
			with self.assertRaises(frappe.ValidationError):
				verify_signup_code(email=self.email, code=self.code)
