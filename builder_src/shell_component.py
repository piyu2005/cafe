"""The app shell (rail, mobile bottom bar, logo menu) as a Builder component.

Per mentor guidance, the desktop rail (logo, nav items, notification bell,
expand toggle) is individual native blocks, editable piece by piece in
Builder's canvas - see build_rail() below. The sidebar, bottom nav and logo
menu stay ready-made HTML in one block for now (see build_shell_html()):
Builder recompiles every block's template on every request, at about 1-2 ms
per block, and the shell renders on every page in the app, so this is the
single highest-leverage place in the whole site for that cost - as separate
blocks the shell was 32 blocks before it was deliberately collapsed into one.
Splitting the rail out again is a real, accepted server-time cost, taken on
for editability; the rest of the shell stays collapsed until asked for too.
To change the still-raw-HTML parts, edit this file and run generate.py, or
edit the block's HTML in Builder's editor.
"""

from blocks import DIALOG_SHADOW, INK, MUTED, OUTLINE, SURFACE_1, block, html_el, icon, raw_block, svg
from shell_component_parts import BADGE_STYLES
from sidebar import build_sidebar

NAV_ITEMS = [
	("home", "Home", "/", "house"),
	("search", "Search", "/search", "search"),
	("messages", "Messages", "/messages", "message-circle"),
	("profile", "Profile", "/profile", "user"),
]
TAB_ITEMS = [*NAV_ITEMS, ("settings", "Settings", "/settings", "settings")]

# On the rail the pill hangs off the item's top right, inside a white ring.
RAIL_BADGE_STYLES = {
	**BADGE_STYLES,
	"top": "-8px",
	"right": "auto",
	"left": "20px",
	"height": "18px",
	"border": "1px solid #ffffff",
	"boxSizing": "border-box",
}
RAIL_ITEM_STYLES = {
	"position": "relative",
	"display": "grid",
	"placeItems": "center",
	"flexShrink": "0",
	"width": "28px",
	"height": "28px",
	"borderRadius": "8px",
	"color": INK,
}
MENU_ITEM_STYLES = {
	"display": "flex",
	"alignItems": "center",
	"gap": "8px",
	"width": "100%",
	"height": "28px",
	"padding": "0 8px",
	"border": "0",
	"borderRadius": "6px",
	"backgroundColor": "transparent",
	"color": INK,
	"fontSize": "14px",
	"textAlign": "left",
	"cursor": "pointer",
}
LOGO_STYLES = {
	"display": "grid",
	"placeItems": "center",
	"flexShrink": "0",
	"width": "32px",
	"height": "32px",
	"margin": "0 -2px",
	"padding": "0",
	"border": "0",
	"borderRadius": "8px",
	"backgroundColor": INK,
	"color": "#ffffff",
	"cursor": "pointer",
}
# The rail itself stretches the full height of the page (background and border).
# Its content sticks to the top of the window while the page scrolls.
RAIL_STYLES = {
	"flexShrink": "0",
	"width": "50px",
	"backgroundColor": SURFACE_1,
	"borderRight": f"1px solid {OUTLINE}",
}
RAIL_CONTENT_STYLES = {
	"position": "sticky",
	"top": "0",
	"display": "flex",
	"flexDirection": "column",
	"alignItems": "center",
	"gap": "12px",
	"height": "100vh",
	"padding": "10px 11px 12px",
}
MENU_STYLES = {
	"display": "none",
	"position": "fixed",
	"top": "46px",
	"left": "8px",
	"zIndex": "50",
	"minWidth": "176px",
	"padding": "4px",
	"borderRadius": "8px",
	"backgroundColor": "#ffffff",
	"boxShadow": DIALOG_SHADOW,
}


def badge(kind="messages", styles=BADGE_STYLES):
	return html_el("span", ["cafe-badge"], {"data-badge": kind}, styles)


def badge_block(kind="messages", styles=None):
	return block("span", "Badge", ["cafe-badge"], attrs={"data-badge": kind}, styles=styles or BADGE_STYLES)


def rail_item_block(key, label, href, icon_name):
	children = [icon(icon_name, 16)]
	if key == "messages":
		children.append(badge_block(styles=RAIL_BADGE_STYLES))
	return block(
		"a",
		label,
		["cafe-rail-item"],
		attrs={
			"href": href,
			"aria-label": label,
			"data-tooltip": label,
			"data-tooltip-side": "right",
			"data-nav": key,
		},
		children=children,
		styles=RAIL_ITEM_STYLES,
	)


def bell_item_block():
	"""The rail's notification bell. A button: it opens the panel (notifications.js)."""
	return block(
		"button",
		"Notifications",
		["cafe-rail-item"],
		attrs={
			"type": "button",
			"aria-label": "Notifications",
			"data-tooltip": "Notifications",
			"data-tooltip-side": "right",
			"data-nav": "notifications",
			"data-bell": "",
		},
		children=[icon("bell", 16), badge_block("notifications", RAIL_BADGE_STYLES)],
		styles={**RAIL_ITEM_STYLES, "padding": "0", "border": "0", "cursor": "pointer"},
	)


def expand_item_block():
	"""The rail's bottom button, which opens the sidebar. icon() wraps the svg
	in a sized div (see its docstring), so the 180deg rotation the old raw svg
	carried on itself goes on that wrapper instead - same visual result."""
	return block(
		"button",
		"Expand",
		["cafe-rail-item", "cafe-expand"],
		attrs={
			"type": "button",
			"aria-label": "Expand",
			"data-tooltip": "Expand",
			"data-tooltip-side": "right",
			"data-sidebar-toggle": "open",
		},
		children=[icon("panel-right-open", 16, styles={"transform": "rotate(180deg)"})],
		styles={**RAIL_ITEM_STYLES, "marginTop": "auto", "padding": "0", "border": "0", "cursor": "pointer"},
	)


def tab_item(key, label, href, icon_name):
	"""Mobile bottom-bar tab. Its look is in styles.css, under the 768px media
	query, because Builder has no breakpoint at that width."""
	children = [svg(icon_name, 24, "inherit")]
	if key == "messages":
		children.append(badge())
	return html_el(
		"a",
		["cafe-tab"],
		{"href": href, "aria-label": label, "data-nav": key},
		None,
		children,
	)


def menu_item(tag, attrs, icon_name, label):
	return html_el(
		tag,
		["cafe-menu-item"],
		{**attrs, "role": "menuitem"},
		MENU_ITEM_STYLES,
		[svg(icon_name, 16, MUTED), html_el("span", text=label)],
	)


def build_shell_html():
	"""Everything but the rail (see build_rail()): the sidebar, the mobile
	bottom bar and the logo menu, still ready-made HTML in one block."""
	bottom_nav = html_el(
		"nav",
		["cafe-bottom-nav"],
		{"aria-label": "Main"},
		{"display": "none"},
		[tab_item(*item) for item in TAB_ITEMS],
	)
	menu = html_el(
		"div",
		["cafe-menu"],
		{"id": "cafe-menu", "role": "menu"},
		MENU_STYLES,
		[
			menu_item("a", {"href": "/settings"}, "settings", "Settings"),
			menu_item("button", {"id": "cafe-logout", "type": "button"}, "log-out", "Logout"),
		],
	)
	return build_sidebar() + bottom_nav + menu


def logo_block():
	return block(
		"button",
		"Logo",
		["cafe-logo"],
		attrs={"type": "button", "aria-label": "Cafe menu", "aria-haspopup": "menu", "data-logo": ""},
		children=[icon("feather", 16)],
		styles=LOGO_STYLES,
	)


def build_rail():
	"""The desktop rail: individual native blocks (logo, each nav item, the
	bell, the expand toggle), so each piece is editable on its own in
	Builder's canvas."""
	content = block(
		"div",
		"Rail content",
		["cafe-rail-content"],
		children=[logo_block()]
		+ [rail_item_block(*item) for item in NAV_ITEMS[:3]]
		+ [bell_item_block(), rail_item_block(*NAV_ITEMS[3]), expand_item_block()],
		styles=RAIL_CONTENT_STYLES,
	)
	return block(
		"nav", "Rail", ["cafe-rail"], attrs={"aria-label": "Main"}, children=[content], styles=RAIL_STYLES
	)


def build_shell():
	# display: contents (on both the outer wrapper and the raw-HTML one) keeps
	# them out of the page layout: the rail, sidebar, bottom nav and menu all
	# stay direct flex children of the app container, same as before the rail
	# became its own block.
	rest = raw_block("Sidebar, bottom nav, menu", build_shell_html(), styles={"display": "contents"})
	return block(
		"div", "Shell", ["cafe-shell"], children=[build_rail(), rest], styles={"display": "contents"}
	)
