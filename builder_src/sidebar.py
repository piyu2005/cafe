"""The expanded rail: a 14rem sidebar with labels, in place of the 50px rail.

The rail's bottom button opens it and its own bottom item closes it. Which is
showing is kept in the browser (shell.js), and styles.css swaps the two by an
attribute on <html>, so a page loads with the right one and nothing jumps."""

from blocks import INK, MUTED, OUTLINE, SURFACE_1, html_el, svg
from shell_component_parts import BADGE_STYLES

GRAY_6 = "#525252"
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
	children = [svg(icon_name, 16), html_el("span", None, None, LABEL_STYLES, text=label)]
	if key in ("messages", "notifications"):
		children.append(html_el("span", ["mna-badge"], {"data-badge": key}, COUNT_STYLES))
	if href:
		return html_el("a", ["mna-side-item"], {"href": href, "data-nav": key}, ITEM_STYLES, children)
	return html_el(
		"button",
		["mna-side-item"],
		{"type": "button", "data-nav": key, "data-bell": ""},
		ITEM_STYLES,
		children,
	)


def build_sidebar():
	logo = html_el(
		"button",
		["mna-side-logo"],
		{"type": "button", "aria-label": "Cafe menu", "aria-haspopup": "menu", "data-logo": ""},
		{
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
		[
			html_el(
				"span",
				None,
				None,
				{
					"display": "grid",
					"placeItems": "center",
					"flexShrink": "0",
					"width": "32px",
					"height": "32px",
					"borderRadius": "8px",
					"backgroundColor": INK,
					"color": "#ffffff",
				},
				[svg("feather", 16)],
			),
			html_el(
				"span",
				None,
				None,
				{
					"flex": "1",
					"textAlign": "left",
					"fontSize": "14px",
					"fontWeight": "500",
					"letterSpacing": "0.015em",
					"lineHeight": "1.15",
					"color": INK,
				},
				text="Cafe",
			),
		],
	)
	collapse = html_el(
		"button",
		["mna-side-item"],
		{"type": "button", "data-sidebar-toggle": "close"},
		ITEM_STYLES,
		[svg("panel-right-open", 16), html_el("span", None, None, LABEL_STYLES, text="Collapse")],
	)
	content = html_el(
		"div",
		["mna-sidebar-content"],
		None,
		{"position": "sticky", "top": "0", "display": "flex", "flexDirection": "column", "height": "100vh"},
		[
			html_el("div", None, None, {"flexShrink": "0", "padding": "8px"}, [logo]),
			html_el(
				"div",
				None,
				None,
				{
					"display": "flex",
					"flexDirection": "column",
					"gap": "6px",
					"marginTop": "2px",
					"padding": "0 8px",
				},
				[item(*entry) for entry in ITEMS],
			),
			html_el("div", None, None, {"marginTop": "auto", "padding": "0 8px 8px"}, [collapse]),
		],
	)
	return html_el(
		"nav",
		["mna-sidebar"],
		{"aria-label": "Main"},
		{
			"display": "none",
			"flexShrink": "0",
			"width": "224px",
			"backgroundColor": SURFACE_1,
			"borderRight": f"1px solid {OUTLINE}",
		},
		[content],
	)
