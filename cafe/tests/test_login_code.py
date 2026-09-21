"""Tests for the passwordless login flow: send_login_code() emails a
6-digit code to an existing user's address, and verify_login_code() checks
it and signs them in - there's no password anywhere in this app, so this is
the only way in. Covers the no-account case explicitly (this app shows that
error plainly rather than staying non-committal about it - see api.py's own
comment on send_login_code for why) plus the same expiry/replay/attempt-limit
edge cases test_signup_verification.py covers for signup's own code."""

from unittest.mock import patch

import frappe
from frappe.tests import IntegrationTestCase, set_user

from cafe.api import (
	CODE_MAX_ATTEMPTS,
	DEV_SHORTCUT_CODE,
	LOGIN_CODE_CACHE_PREFIX,
	send_login_code,
	verify_login_code,
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


class TestSendLoginCode(IntegrationTestCase):
	def test_rejects_email_with_no_account(self):
		# Fails on the account-existence check, before ever reaching
		# frappe.sendmail() - no email account needs to be configured to
		# test this one.
		with set_user("Guest"):
			with self.assertRaises(frappe.ValidationError):
				send_login_code(email="nobody_has_this_email@example.com")

	@patch("frappe.sendmail")
	def test_caches_a_code_for_an_existing_user(self, mock_sendmail):
		# Actually sending mail is frappe core's own tested responsibility,
		# not this function's - and CI has no outgoing Email Account
		# configured, so a real frappe.sendmail() call here would fail with
		# OutgoingEmailError regardless of whether the caching logic below is
		# correct. Mocked out so this test isolates what send_login_code()
		# itself is responsible for.
		email = _make_user("login_code_send@example.com", "Sender")
		with set_user("Guest"):
			send_login_code(email=email)
		mock_sendmail.assert_called_once()
		cached = frappe.parse_json(frappe.cache.get_value(f"{LOGIN_CODE_CACHE_PREFIX}{email}"))
		self.assertEqual(len(cached["code"]), 6)
		self.assertEqual(cached["attempts"], 0)


class TestVerifyLoginCode(IntegrationTestCase):
	def setUp(self):
		unique = frappe.generate_hash(length=8)
		self.code = "654321"
		self.email = f"login_flow_{unique}@example.com"
		_make_user(self.email, "LoginFlow")

		# Same reasoning as test_signup_verification.py's own setUp: the real
		# login step needs a full WSGI request context that only a real HTTP
		# call provides, so it's mocked here and verified separately via curl.
		login_manager_patcher = patch("cafe.api.LoginManager")
		self.mock_login_manager = login_manager_patcher.start()
		self.addCleanup(login_manager_patcher.stop)

	def _seed_login_code(self, **overrides):
		payload = {"code": self.code, "attempts": 0}
		payload.update(overrides)
		frappe.cache.set_value(
			f"{LOGIN_CODE_CACHE_PREFIX}{self.email}", frappe.as_json(payload), expires_in_sec=600
		)

	def test_valid_code_logs_in_and_consumes_the_code(self):
		self._seed_login_code()
		with set_user("Guest"):
			verify_login_code(email=self.email, code=self.code)
		self.assertIsNone(frappe.cache.get_value(f"{LOGIN_CODE_CACHE_PREFIX}{self.email}"))
		self.mock_login_manager.return_value.login_as.assert_called_once_with(self.email)

	def _set_developer_mode(self, value):
		original = frappe.conf.get("developer_mode")
		frappe.conf.developer_mode = value
		self.addCleanup(lambda: frappe.conf.__setitem__("developer_mode", original))

	def test_dev_shortcut_code_works_when_developer_mode_is_on(self):
		self._seed_login_code()
		self._set_developer_mode(1)
		with set_user("Guest"):
			verify_login_code(email=self.email, code=DEV_SHORTCUT_CODE)
		self.mock_login_manager.return_value.login_as.assert_called_once_with(self.email)

	def test_dev_shortcut_code_is_rejected_when_developer_mode_is_off(self):
		# developer_mode being off (the default, and what any real hosted
		# site should have) means the shortcut is just another wrong code.
		self._seed_login_code()
		self._set_developer_mode(0)
		with set_user("Guest"):
			with self.assertRaises(frappe.ValidationError):
				verify_login_code(email=self.email, code=DEV_SHORTCUT_CODE)
		self.mock_login_manager.return_value.login_as.assert_not_called()

	def test_valid_code_is_single_use(self):
		self._seed_login_code()
		with set_user("Guest"):
			verify_login_code(email=self.email, code=self.code)
			with self.assertRaises(frappe.ValidationError):
				verify_login_code(email=self.email, code=self.code)

	def test_no_pending_code_is_rejected(self):
		with set_user("Guest"):
			with self.assertRaises(frappe.ValidationError):
				verify_login_code(email=self.email, code="111111")
		self.mock_login_manager.return_value.login_as.assert_not_called()

	def test_wrong_code_counts_as_an_attempt(self):
		self._seed_login_code()
		with set_user("Guest"):
			with self.assertRaises(frappe.ValidationError):
				verify_login_code(email=self.email, code="111111")
		cached = frappe.parse_json(frappe.cache.get_value(f"{LOGIN_CODE_CACHE_PREFIX}{self.email}"))
		self.assertEqual(cached["attempts"], 1)
		self.mock_login_manager.return_value.login_as.assert_not_called()

	def test_too_many_wrong_attempts_invalidates_the_code(self):
		self._seed_login_code(attempts=CODE_MAX_ATTEMPTS)
		with set_user("Guest"):
			with self.assertRaises(frappe.ValidationError):
				verify_login_code(email=self.email, code=self.code)
		self.assertIsNone(frappe.cache.get_value(f"{LOGIN_CODE_CACHE_PREFIX}{self.email}"))
