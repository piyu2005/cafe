"""The Messages page. chat_*.js draw the list, the open
conversation and the composer into #cafe-chat, and talk to the same
whitelisted methods (cafe.chat.*) as the old page.

Builder's editor and the folder thumbnail do not run scripts, so #cafe-chat
starts with a still picture of the chat; the script replaces it."""

import hashlib

from bell import mobile_bell_block
from blocks import INK, INK_BLACK, MUTED, attribute, block, instance_of, raw_block, svg, text_style
from data_scripts import HELPERS
from layout import crumb_current, crumb_link, crumb_separator, page_header
from stand_ins import ASSETS, ASSETS_URL, chat_panes

# The scripts, in the order they load (chat_<part>.js).
CHAT_PARTS = [
	"core",
	"list",
	"messages",
	"thread",
	"composer",
	"emoji",
	"actions",
	"search",
	"dialogs",
	"mentions",
	"live",
]
VENDOR = ["chat-editor.min.js"]


def native_head_html():
	"""The editor bundle the composer needs, with a version so a new build is fetched."""
	tags = []
	for file in VENDOR:
		path = ASSETS / "vendor" / file
		version = hashlib.sha1(path.read_bytes()).hexdigest()[:10] if path.exists() else "0"
		tags.append(f'<script src="{ASSETS_URL}vendor/{file}?v={version}" defer></script>')
	return "\n".join(tags)


BUTTON_STYLES = {
	"display": "inline-flex",
	"alignItems": "center",
	"justifyContent": "center",
	"gap": "8px",
	"height": "28px",
	"padding": "0 8px",
	"border": "1px solid #e2e2e2",
	"borderRadius": "8px",
	"backgroundColor": "#ffffff",
	"color": INK,
	"fontSize": "14px",
	"whiteSpace": "nowrap",
	"cursor": "pointer",
}


def group_button_block(button_id, label, icon_only=False):
	styles = {**BUTTON_STYLES, "width": "28px", "padding": "0"} if icon_only else BUTTON_STYLES
	icon = raw_block("Icon", svg("users", 16))
	children = [icon] if icon_only else [icon, block("span", text=label)]
	return block(
		"button",
		classes=["cafe-btn", "cafe-btn-outline", "cafe-c-new-group"],
		attrs={"type": "button", "id": button_id, "aria-label": label},
		styles=styles,
		children=children,
	)


def desktop_header():
	header = page_header([crumb_link("Cafe", "/"), crumb_separator(), crumb_current("Messages")])
	# The New Post button of the shared header becomes New group.
	header["children"][1] = block(
		"div",
		"New group",
		styles={"display": "flex"},
		children=[group_button_block("cafe-new-group", "New group")],
	)
	return header


def mobile_header():
	title = block(
		"h1",
		"Title",
		["cafe-mobile-title"],
		text="Messages",
		styles={
			"position": "absolute",
			"left": "0",
			"right": "0",
			"margin": "0",
			"textAlign": "center",
			"pointerEvents": "none",
			**text_style(17, "600", INK_BLACK, "0.015em", "1.25"),
		},
	)
	actions = block(
		"div",
		"Actions",
		children=[mobile_bell_block(), group_button_block("cafe-new-group-m", "New group", icon_only=True)],
		styles={
			"position": "relative",
			"display": "flex",
			"alignItems": "center",
			"gap": "4px",
			"flexShrink": "0",
			"marginLeft": "auto",
		},
	)
	return block(
		"header",
		"Mobile header",
		["cafe-mobile-header", "cafe-chat-mobile-head"],
		styles={
			"display": "none",
			"position": "relative",
			"alignItems": "center",
			"justifyContent": "space-between",
			"gap": "16px",
			"height": "52px",
			"flexShrink": "0",
			"padding": "0 12px",
			"borderBottom": "1px solid #ededed",
			"backgroundColor": "#ffffff",
		},
		children=[title, actions],
	)


def build_native_chat(shell_id, shell_block):
	chat = block(
		"div",
		"Chat",
		["cafe-c-root"],
		attrs={"id": "cafe-chat"},
		custom={"data-conversation": ""},
		styles={
			"display": "flex",
			"flex": "1",
			"minHeight": "0",
			"width": "100%",
			"backgroundColor": "#ffffff",
		},
		children=[
			raw_block(
				"Preview",
				chat_panes(),
				["cafe-c-preview"],
				styles={"display": "flex", "flex": "1", "minHeight": "0", "width": "100%"},
			)
		],
	)
	chat = attribute(chat, "w.id", "data-conversation")
	main = block(
		"div",
		"Main",
		["cafe-main", "cafe-chat-main"],
		styles={
			"display": "flex",
			"flexGrow": "1",
			"flexDirection": "column",
			"minWidth": "0",
			"height": "100vh",
			"overflow": "hidden",
		},
		children=[mobile_header(), desktop_header(), chat],
	)
	app = block(
		"div",
		"App",
		["cafe-app"],
		styles={
			"display": "flex",
			"width": "100%",
			"height": "100vh",
			"backgroundColor": "#ffffff",
			**text_style(14, "420", INK_BLACK, "0.02em", "1.15"),
		},
		children=[instance_of(shell_id, shell_block, "Shell"), main],
	)
	top = block("div", None, children=[app])
	top["blockId"] = "root"
	top["originalElement"] = "body"
	return [top]


def build_data_script():
	"""Sends a guest to sign in first; the scripts load everything else."""
	return (
		HELPERS
		+ """\
item = frappe.form_dict.conversation_id or ""

if frappe.session.user == "Guest":
    redirect("/login?redirect=/messages" + ("/" + path_segment(item) if item else ""))

data.w = {"id": clean(item)}
"""
	)


CHAT_DATA_SCRIPT = build_data_script()
