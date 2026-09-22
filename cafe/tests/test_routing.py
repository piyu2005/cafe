"""The Builder Home page is served at "/" and nowhere else, and only while it
is published. Every other address is left to its own Builder page."""

from unittest.mock import patch

import frappe
from frappe.tests import IntegrationTestCase
from werkzeug.test import EnvironBuilder
from werkzeug.wrappers import Request

from cafe.routing import HOME_ROUTE, BuilderPageRenderer, HomeRenderer


def _request_to(path):
	frappe.local.request = Request(EnvironBuilder(path=path).get_environ())


class TestHomeRenderer(IntegrationTestCase):
	def setUp(self):
		if not BuilderPageRenderer:
			self.skipTest("Builder is not installed")

	def tearDown(self):
		frappe.local.request = None

	def _can_render(self, path, builder_finds_page=True):
		_request_to(path)
		renderer = HomeRenderer("")
		with patch.object(BuilderPageRenderer, "can_render", return_value=builder_finds_page):
			return renderer.can_render(), renderer

	def test_root_is_rendered_by_the_home_page(self):
		can_render, renderer = self._can_render("/")
		self.assertTrue(can_render)
		self.assertEqual(renderer.path, HOME_ROUTE)

	def test_root_with_a_query_string_too(self):
		can_render, _ = self._can_render("/?utm=1")
		self.assertTrue(can_render)

	def test_root_is_left_to_frappe_when_the_page_is_unpublished(self):
		can_render, _ = self._can_render("/", builder_finds_page=False)
		self.assertFalse(can_render)

	def test_other_paths_are_left_alone(self):
		for path in ("/messages", "/settings", "/write", "/some/deep/path", "/cafe-home-2"):
			can_render, renderer = self._can_render(path)
			self.assertFalse(can_render, path)
			self.assertNotEqual(renderer.path, HOME_ROUTE, path)
