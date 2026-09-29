"""The expanded rail: a 14rem sidebar with labels, in place of the 50px rail.

The rail's bottom button opens it and its own bottom item closes it. Which is
showing is kept in the browser (shell.js), and styles.css swaps the two by an
attribute on <html>, so a page loads with the right one and nothing jumps.

Individual native blocks, same as build_rail() in shell_component.py: each
item is its own block, editable on its own in Builder's canvas."""

from blocks import INK, OUTLINE, SOLID_BG, SURFACE_1, block, icon
from shell_component_parts import BADGE_STYLES

GRAY_6 = "var(--ink-gray-6)"
LABEL_STYLES = {
	"fontSize": "13px",
	"fontWeight": "420",
	"letterSpacing": "0.02em",
	"lineHeight": "1.15",
	"color": "inherit",
}
ITEM_STYLES = {
	"display": "flex",
	"alignItems": "center",
	"gap": "8px",
	"width": "100%",
	"height": "28px",
	"padding": "0 0 0 8px",
	"border": "0",
	"borderRadius": "8px",
	"backgroundColor": "transparent",
	"color": GRAY_6,
	"cursor": "pointer",
	"textAlign": "left",
	"textDecoration": "none",
}
COUNT_STYLES = {
	**BADGE_STYLES,
	"position": "static",
	"marginLeft": "auto",
	"marginRight": "4px",
	"flexShrink": "0",
}

ITEMS = [
	("home", "Feed", "/", "house"),
	("search", "Explore", "/search", "search"),
	("messages", "Messages", "/messages", "message-circle"),
	("notifications", "Notifications", None, "bell"),
	("profile", "Profile", "/profile", "user"),
]


def item(key, label, href, icon_name):
	children = [icon(icon_name, 16), block("span", "Label", text=label, styles=LABEL_STYLES)]
	if key in ("messages", "notifications"):
		children.append(
			block("span", "Count", ["cafe-badge"], attrs={"data-badge": key}, styles=COUNT_STYLES)
		)
	if href:
		return block(
			"a",
			label,
			["cafe-side-item"],
			attrs={"href": href, "data-nav": key},
			children=children,
			styles=ITEM_STYLES,
		)
	return block(
		"button",
		label,
		["cafe-side-item"],
		attrs={"type": "button", "data-nav": key, "data-bell": ""},
		children=children,
		styles=ITEM_STYLES,
	)


def sidebar_logo_block():
	return block(
		"button",
		"Logo",
		["cafe-side-logo"],
		attrs={"type": "button", "aria-label": "Cafe menu", "aria-haspopup": "menu", "data-logo": ""},
		children=[
			block(
				"span",
				"Mark",
				children=[icon("feather", 16)],
				styles={
					"display": "grid",
					"placeItems": "center",
					"flexShrink": "0",
					"width": "32px",
					"height": "32px",
					"borderRadius": "8px",
					"backgroundColor": SOLID_BG,
					"color": "#ffffff",
				},
			),
			block(
				"span",
				"Name",
				text="Cafe",
				styles={
					"flex": "1",
					"textAlign": "left",
					"fontSize": "14px",
					"fontWeight": "500",
					"letterSpacing": "0.015em",
					"lineHeight": "1.15",
					"color": INK,
				},
			),
		],
		styles={
			"display": "flex",
			"alignItems": "center",
			"gap": "8px",
			"width": "100%",
			"height": "40px",
			"padding": "4px",
			"border": "0",
			"borderRadius": "8px",
			"backgroundColor": "transparent",
			"cursor": "pointer",
			"color": INK,
		},
	)


def collapse_block():
	return block(
		"button",
		"Collapse",
		["cafe-side-item"],
		attrs={"type": "button", "data-sidebar-toggle": "close"},
		children=[icon("panel-right-open", 16), block("span", "Label", text="Collapse", styles=LABEL_STYLES)],
		styles=ITEM_STYLES,
	)


def build_sidebar():
	content = block(
		"div",
		"Sidebar content",
		["cafe-sidebar-content"],
		styles={
			"position": "sticky",
			"top": "0",
			"display": "flex",
			"flexDirection": "column",
			"height": "100vh",
		},
		children=[
			block(
				"div",
				"Logo row",
				styles={"flexShrink": "0", "padding": "8px"},
				children=[sidebar_logo_block()],
			),
			block(
				"div",
				"Items",
				styles={
					"display": "flex",
					"flexDirection": "column",
					"gap": "6px",
					"marginTop": "2px",
					"padding": "0 8px",
				},
				children=[item(*entry) for entry in ITEMS],
			),
			block(
				"div",
				"Collapse row",
				styles={"marginTop": "auto", "padding": "0 8px 8px"},
				children=[collapse_block()],
			),
		],
	)
	return block(
		"nav",
		"Sidebar",
		["cafe-sidebar"],
		attrs={"aria-label": "Main"},
		styles={
			"display": "none",
			"flexShrink": "0",
			"width": "224px",
			"backgroundColor": SURFACE_1,
			"borderRight": f"1px solid {OUTLINE}",
		},
		children=[content],
	)
