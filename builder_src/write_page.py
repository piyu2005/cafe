"""The native post editor page: /write and /write/<post>. write_*.js
draw the story, toolbar, title and tags into #cafe-write and save through the
same /api/v2/document/Post the old page uses.

Builder's editor and the folder thumbnail do not run scripts, so #cafe-write
starts with a still picture of the page; the script replaces it."""

import hashlib

from bell import mobile_bell_block
from blocks import INK, INK_BLACK, attribute, block, instance_of, raw_block, svg, text_style
from chat_page import BUTTON_STYLES
from data_scripts import HELPERS
from layout import crumb_link, crumb_separator, page_header
from stand_ins import ASSETS, ASSETS_URL, write_body

WRITE_PARTS = ["core", "editor", "preview", "live"]
VENDOR = ["write-editor.min.js"]

SOLID_STYLES = {**BUTTON_STYLES, "border": "0", "backgroundColor": INK, "color": "#ffffff"}
ICON_STYLES = {**BUTTON_STYLES, "width": "28px", "padding": "0", "border": "0", "backgroundColor": "#f3f3f3"}


def native_head_html():
	"""The editor bundle the page needs, with a version so a new build is fetched."""
	tags = []
	for file in VENDOR:
		path = ASSETS / "vendor" / file
		version = hashlib.sha1(path.read_bytes()).hexdigest()[:10] if path.exists() else "0"
		tags.append(f'<script src="{ASSETS_URL}vendor/{file}?v={version}" defer></script>')
	return "\n".join(tags)


def button_block(button_id, label, kind, extra_class=""):
	styles = {"outline": BUTTON_STYLES, "solid": SOLID_STYLES}[kind]
	classes = ["cafe-btn", f"cafe-btn-{kind}", "cafe-w-btn", *([extra_class] if extra_class else [])]
	return block(
		"button",
		classes=classes,
		attrs={"type": "button", "id": button_id},
		styles=styles,
		children=[block("span", text=label)],
	)


def more_button_block(button_id, hidden=False):
	attrs = {"type": "button", "id": button_id, "aria-label": "More"}
	if hidden:
		attrs["hidden"] = "hidden"
	icon = raw_block("Icon", svg("ellipsis", 16))
	return block(
		"button", classes=["cafe-btn", "cafe-w-more"], attrs=attrs, styles=ICON_STYLES, children=[icon]
	)


def desktop_header():
	crumbs = [
		crumb_link("Cafe", "/"),
		crumb_separator(),
		block(
			"span",
			"Current",
			["current"],
			text="Write",
			attrs={"id": "cafe-w-crumb"},
			styles={"color": INK_BLACK},
		),
	]
	header = page_header(crumbs)
	header["children"][1] = block(
		"div",
		"Actions",
		styles={"display": "flex", "alignItems": "center", "gap": "8px"},
		children=[
			button_block("cafe-w-draft", "Save Draft", "outline"),
			button_block("cafe-w-publish", "Publish", "solid"),
			more_button_block("cafe-w-more", hidden=True),
		],
	)
	return header


def mobile_header():
	back = block(
		"a",
		"Back",
		["cafe-mobile-back"],
		attrs={"href": "/", "aria-label": "Back", "id": "cafe-w-back"},
		inner_html=svg("chevron-left", 18),
		styles={
			"display": "grid",
			"placeItems": "center",
			"flexShrink": "0",
			"width": "32px",
			"height": "32px",
			"borderRadius": "8px",
			"color": INK,
		},
	)
	title = block(
		"h1",
		"Title",
		["cafe-mobile-title"],
		text="Write",
		attrs={"id": "cafe-w-mtitle"},
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
		children=[
			mobile_bell_block(),
			more_button_block("cafe-w-mmore"),
			button_block("cafe-w-mpublish", "Publish", "solid"),
		],
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
		["cafe-mobile-header", "cafe-write-mobile-head"],
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
		children=[back, title, actions],
	)


def build_native_write(shell_id, shell_block):
	page = block(
		"div",
		"Write",
		["cafe-w-root"],
		attrs={"id": "cafe-write"},
		custom={"data-post": ""},
		styles={
			"display": "flex",
			"flex": "1",
			"flexDirection": "column",
			"minHeight": "0",
			"width": "100%",
			"backgroundColor": "#ffffff",
		},
		children=[raw_block("Preview", write_body(), ["cafe-w-preview"], styles={"width": "100%"})],
	)
	page = attribute(page, "w.id", "data-post")
	main = block(
		"div",
		"Main",
		["cafe-main", "cafe-write-main"],
		styles={
			"display": "flex",
			"flexGrow": "1",
			"flexDirection": "column",
			"minWidth": "0",
			"height": "100vh",
			"overflow": "hidden",
		},
		children=[mobile_header(), desktop_header(), page],
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
item = frappe.form_dict.post_id or ""

if frappe.session.user == "Guest":
    redirect("/login?redirect=/write" + ("/" + path_segment(item) if item else ""))

data.w = {"id": clean(item)}
"""
	)


WRITE_NATIVE_DATA_SCRIPT = build_data_script()
