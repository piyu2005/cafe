"""Generates the Builder files in cafe/builder_files/ from the sources here.

Builder stores pages, components and scripts as JSON that is long and hard to
review. The sources of truth are the plain files in this folder (styles.css,
shell.js, search.js) and this script. Run it after changing any of them:

	python3 apps/cafe/builder_src/generate.py

Styling is split on purpose. Everything static (sizes, colors, spacing, layout)
is set on the blocks, because Builder's editor canvas shows only block styles:
it never loads a page's CSS script. styles.css keeps what a block cannot
express: hover and focus states, the mobile layout (Builder's own breakpoints
are 576 and 1024px, ours is 768px), fonts, and the elements JavaScript creates.

Then run `bench migrate` (or reload the site) to import the result. Builder
only imports a file whose `modified` is newer than the copy in the database, so
every run stamps the current time.
"""

import hashlib
import json
import re
import shutil
from datetime import datetime
from pathlib import Path

SRC = Path(__file__).resolve().parent
REPO = SRC.parent
APP = REPO / "cafe"
OUT = APP / "builder_files"
FONTS_OUT = APP / "public" / "builder_assets" / "fonts"
SCRIPT_ICONS = {
	"settings.js": ("bookmark", "bookmark-minus"),
	"code.js": ("copy", "check"),
	"chat_core.js": (
		"arrow-left",
		"at-sign",
		"bar-chart-2",
		"bell",
		"bell-off",
		"bold",
		"braces",
		"check",
		"chevron-down",
		"chevron-left",
		"chevron-right",
		"chevron-up",
		"circle",
		"circle-check",
		"code",
		"download",
		"ellipsis",
		"file",
		"forward",
		"highlighter",
		"inbox",
		"italic",
		"list",
		"list-ordered",
		"paperclip",
		"pencil",
		"plus",
		"quote",
		"remove-formatting",
		"reply",
		"search",
		"send",
		"shield",
		"shield-ban",
		"shield-check",
		"shield-off",
		"smile-plus",
		"strikethrough",
		"trash-2",
		"type",
		"underline",
		"user-minus",
		"users",
		"x",
	),
	"write_core.js": (
		"align-center",
		"align-left",
		"align-right",
		"archive",
		"bold",
		"heading",
		"heading-2",
		"heading-3",
		"heading-4",
		"image",
		"italic",
		"link",
		"list",
		"list-ordered",
		"pilcrow",
		"quote",
		"save",
		"strikethrough",
		"trash-2",
		"underline",
	),
	"pub_core.js": (
		"arrow-left",
		"arrow-right",
		"check",
		"globe",
		"pencil",
		"search",
		"share-2",
		"shield",
		"user",
		"user-minus",
		"user-plus",
		"x",
	),
	"notifications.js": (
		"heart",
		"message-circle",
		"at-sign",
		"users",
		"newspaper",
		"bell",
		"check-check",
		"x",
	),
}
VENDOR_OUT = APP / "public" / "builder_assets" / "vendor"
SOCKET_CLIENT = REPO / "vendor_src" / "node_modules" / "socket.io-client" / "dist" / "socket.io.min.js"
FONT_DIR = SRC / "assets" / "Newsreader"
FONT_FILES = {FONT_DIR / "Newsreader-Regular.woff2", FONT_DIR / "Newsreader-Medium.woff2"}

NOW = datetime.now().strftime("%Y-%m-%d %H:%M:%S.%f")


def slug(name):
	return re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")


from auth_page import LOGIN_DATA_SCRIPT, SIGNUP_DATA_SCRIPT, build_login, build_signup
from blocks import svg
from chat_page import CHAT_DATA_SCRIPT, CHAT_PARTS, build_native_chat, native_head_html
from home_page import HOME_DATA_SCRIPT, build_home
from post_page import POST_DATA_SCRIPT, build_post_page
from posts_page import POSTS_DATA_SCRIPT, build_posts_page
from profile_page import (
	PROFILE_DATA_SCRIPT,
	PROFILE_REDIRECT_SCRIPT,
	build_profile,
	build_profile_redirect,
)
from pub_page import (
	INVITE_DATA_SCRIPT,
	MEMBERS_DATA_SCRIPT,
	PUB_PARTS,
	PUBLICATION_DATA_SCRIPT,
	build_invite,
	build_members,
	build_publication,
)
from search_page import SEARCH_DATA_SCRIPT, build_search
from settings_page import SETTINGS_DATA_SCRIPT, build_settings
from shell_component import build_shell
from write_page import WRITE_NATIVE_DATA_SCRIPT, WRITE_PARTS, build_native_write
from write_page import native_head_html as native_write_head


def client_script(name, script_type, source, idx):
	return {
		"creation": NOW,
		"docstatus": 0,
		"doctype": "Builder Client Script",
		"idx": idx,
		"modified": NOW,
		"modified_by": "Administrator",
		"name": name,
		"owner": "Administrator",
		"script": source,
		"script_type": script_type,
	}


def component(component_id, name, root_block):
	return {
		"block": json.dumps(root_block),
		"component_data_script": None,
		"component_id": component_id,
		"component_name": name,
		"creation": NOW,
		"docstatus": 0,
		"doctype": "Builder Component",
		"for_web_page": None,
		"idx": 0,
		"modified": NOW,
		"modified_by": "Administrator",
		"name": component_id,
		"owner": "Administrator",
	}


def page(name, title, route, blocks, script_names, data_script, dynamic=False, head=None):
	return {
		"app": "cafe",
		"authenticated_access": 0,
		"blocks": blocks,
		"client_scripts": [{"builder_script": script} for script in script_names],
		"creation": NOW,
		"disable_indexing": 1,
		"docstatus": 0,
		"doctype": "Builder Page",
		"draft_blocks": None,
		"dynamic_route": 1 if dynamic else 0,
		"head_html": head,
		"idx": 0,
		"is_standard": 1,
		"is_template": 0,
		"modified": NOW,
		"modified_by": "Administrator",
		"name": name,
		"owner": "Administrator",
		"page_data_script": data_script,
		"page_name": name,
		"page_title": title,
		"project_folder": "cafe",
		"published": 1,
		"published_at": NOW,
		"route": route,
	}


TIMESTAMPS = ("creation", "modified", "published_at")


def without_timestamps(doc):
	return {key: value for key, value in doc.items() if key not in TIMESTAMPS}


def read_existing():
	"""The files from the last run, so an unchanged file keeps its timestamps."""
	if not OUT.exists():
		return {}
	return {path: json.loads(path.read_text()) for path in OUT.rglob("*.json")}


EXISTING = {}


def write_json(kind, name, doc):
	folder = OUT / kind / slug(name)
	folder.mkdir(parents=True, exist_ok=True)
	path = folder / f"{slug(name)}.json"
	old = EXISTING.get(path)
	if old is not None and without_timestamps(old) == without_timestamps(doc):
		doc = old  # nothing changed: keep the timestamps, so git and Builder see no change
	path.write_text(json.dumps(doc, indent=1, ensure_ascii=False) + "\n")


def main():
	EXISTING.update(read_existing())
	if OUT.exists():
		shutil.rmtree(OUT)

	# The live-updates client, so pages do not depend on a path inside Frappe.
	VENDOR_OUT.mkdir(parents=True, exist_ok=True)
	shutil.copy(SOCKET_CLIENT, VENDOR_OUT / SOCKET_CLIENT.name)

	FONTS_OUT.mkdir(parents=True, exist_ok=True)
	for font in FONT_FILES:
		shutil.copy(font, FONTS_OUT / font.name)

	scripts = [
		("Cafe Styles", "CSS", "styles.css"),
		("Cafe UI", "JavaScript", "ui.js"),
		("Cafe Shell", "JavaScript", "shell.js"),
		("Cafe Search", "JavaScript", "search.js"),
		("Cafe Profile", "JavaScript", "profile.js"),
		("Cafe Posts", "JavaScript", "posts.js"),
		("Cafe Post", "JavaScript", "post.js"),
		("Cafe Home", "JavaScript", "home.js"),
		("Cafe Settings", "JavaScript", "settings.js"),
		("Cafe Notifications", "JavaScript", "notifications.js"),
		("Cafe Auth", "JavaScript", "auth.js"),
		("Cafe Code", "JavaScript", "code.js"),
		("Cafe Chat Styles", "CSS", "chat.css"),
		*[(f"Cafe Chat {part.title()}", "JavaScript", f"chat_{part}.js") for part in CHAT_PARTS],
		("Cafe Publications Styles", "CSS", "publications.css"),
		*[(f"Cafe Pub {part.title()}", "JavaScript", f"pub_{part}.js") for part in PUB_PARTS],
		("Cafe Write Styles", "CSS", "write.css"),
		*[(f"Cafe Write {part.title()}", "JavaScript", f"write_{part}.js") for part in WRITE_PARTS],
	]
	for index, (name, kind, filename) in enumerate(scripts, start=1):
		source = (SRC / filename).read_text()
		# These scripts draw their icons from the same lucide files as the blocks.
		if filename in SCRIPT_ICONS:
			source = source.replace(
				"'@@ICONS@@'", json.dumps({name: svg(name, 16) for name in SCRIPT_ICONS[filename]})
			)
		write_json("client_scripts", name, client_script(name, kind, source, index))

	shell_id = hashlib.sha1(b"cafe:Cafe Shell").hexdigest()[:16]
	shell_block = build_shell()
	write_json("components", "Cafe Shell", component(shell_id, "Cafe Shell", shell_block))

	# Registers the heading font with Builder, so its editor canvas and the
	# published page both load it (a CSS @font-face would reach only the page).
	write_json(
		"fonts",
		"newsreader",
		{
			"doctype": "User Font",
			"font_file": "/assets/cafe/builder_assets/fonts/Newsreader-Regular.woff2",
			"font_name": "Newsreader",
			"name": "Newsreader",
		},
	)

	# Builder writes one @font-face per font name, without a weight, so the
	# medium weight the Home heading uses is a second name.
	write_json(
		"fonts",
		"newsreader_medium",
		{
			"doctype": "User Font",
			"font_file": "/assets/cafe/builder_assets/fonts/Newsreader-Medium.woff2",
			"font_name": "Newsreader Medium",
			"name": "Newsreader Medium",
		},
	)

	shared = ["Cafe Styles", "Cafe UI", "Cafe Shell", "Cafe Settings", "Cafe Notifications"]
	# The sign-in pages have no shell, so none of the scripts that work with it.
	alone = ["Cafe Styles", "Cafe UI"]

	def pub_scripts(part):
		return ["Cafe Publications Styles", "Cafe Pub Core", f"Cafe Pub {part.title()}"]

	write_scripts = ["Cafe Write Styles"] + [f"Cafe Write {part.title()}" for part in WRITE_PARTS]
	chat_scripts = ["Cafe Chat Styles"] + [f"Cafe Chat {part.title()}" for part in CHAT_PARTS]
	pages = [
		(
			"cafe-search",
			"Search",
			"search",
			build_search,
			[*shared, "Cafe Search"],
			SEARCH_DATA_SCRIPT,
			False,
		),
		(
			"cafe-profile",
			"Profile",
			"profile/:username",
			build_profile,
			[*shared, "Cafe Profile"],
			PROFILE_DATA_SCRIPT,
			True,
		),
		(
			"cafe-profile-self",
			"My profile",
			"profile",
			build_profile_redirect,
			["Cafe Styles"],
			PROFILE_REDIRECT_SCRIPT,
			False,
		),
		(
			"cafe-profile-posts",
			"Profile posts",
			"profile/:username/posts",
			build_posts_page,
			[*shared, "Cafe Posts"],
			POSTS_DATA_SCRIPT,
			True,
		),
		(
			"cafe-post",
			"Post",
			"posts/:post_id",
			build_post_page,
			[*shared, "Cafe Post", "Cafe Code"],
			POST_DATA_SCRIPT,
			True,
		),
		("cafe-home", "Home", "cafe-home", build_home, [*shared, "Cafe Home"], HOME_DATA_SCRIPT, False),
		("cafe-settings", "Settings", "settings", build_settings, shared, SETTINGS_DATA_SCRIPT, False),
		("cafe-login", "Login", "login", build_login, [*alone, "Cafe Auth"], LOGIN_DATA_SCRIPT, False),
		("cafe-signup", "Signup", "signup", build_signup, [*alone, "Cafe Auth"], SIGNUP_DATA_SCRIPT, False),
		(
			"cafe-publication",
			"Publication",
			"publications/:handle",
			build_publication,
			shared + pub_scripts("detail"),
			PUBLICATION_DATA_SCRIPT,
			True,
		),
		(
			"cafe-publication-members",
			"Publication members",
			"publications/:handle/members",
			build_members,
			shared + pub_scripts("members"),
			MEMBERS_DATA_SCRIPT,
			True,
		),
		(
			"cafe-invite",
			"Invite people",
			"invite",
			build_invite,
			shared + pub_scripts("invite"),
			INVITE_DATA_SCRIPT,
			False,
		),
		(
			"cafe-write",
			"Write",
			"write",
			build_native_write,
			shared + write_scripts,
			WRITE_NATIVE_DATA_SCRIPT,
			False,
			native_write_head(),
		),
		(
			"cafe-write-edit",
			"Edit post",
			"write/:post_id",
			build_native_write,
			shared + write_scripts,
			WRITE_NATIVE_DATA_SCRIPT,
			True,
			native_write_head(),
		),
		(
			"cafe-chat",
			"Messages",
			"messages",
			build_native_chat,
			shared + chat_scripts,
			CHAT_DATA_SCRIPT,
			False,
			native_head_html(),
		),
		(
			"cafe-chat-thread",
			"Conversation",
			"messages/:conversation_id",
			build_native_chat,
			shared + chat_scripts,
			CHAT_DATA_SCRIPT,
			True,
			native_head_html(),
		),
	]
	for name, title, route, builder, script_names, data_script, dynamic, *extra in pages:
		blocks = builder(shell_id, shell_block)
		head = extra[0] if extra else None
		write_json("pages", name, page(name, title, route, blocks, script_names, data_script, dynamic, head))
	print(f"Wrote Builder files to {OUT}")


if __name__ == "__main__":
	main()
