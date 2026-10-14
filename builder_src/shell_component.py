"""The app shell (nav, mobile bottom bar, logo menu) as a Builder component.

Every piece - the desktop/sidebar nav (sidebar.py), the phone bottom bar and
the logo menu - is individual native blocks, editable piece by piece in
Builder's canvas. This costs real server render time (Builder recompiles
every block's template on every request, at about 1-2 ms per block, and the
shell renders on every page in the app), a cost accepted on purpose for
editability - see build_shell() for the numbers.
"""

from blocks import DIALOG_SHADOW, INK, MUTED, block, icon
from shell_component_parts import BADGE_STYLES
from sidebar import build_nav

NAV_ITEMS = [
	("home", "Home", "/", "house"),
	("search", "Search", "/search", "search"),
	("messages", "Messages", "/messages", "message-circle"),
	("profile", "Profile", "/profile", "user"),
]
TAB_ITEMS = [*NAV_ITEMS, ("settings", "Settings", "/settings", "settings")]

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


def badge_block(kind="messages", styles=None):
	return block("span", "Badge", ["cafe-badge"], attrs={"data-badge": kind}, styles=styles or BADGE_STYLES)


def tab_item_block(key, label, href, icon_name):
	"""Mobile bottom-bar tab. Its look is in styles.css, under the 768px media
	query, because Builder has no breakpoint at that width."""
	children = [icon(icon_name, 24, "inherit")]
	if key == "messages":
		children.append(badge_block())
	return block(
		"a",
		label,
		["cafe-tab"],
		attrs={"href": href, "aria-label": label, "data-nav": key},
		children=children,
	)


def menu_item_block(tag, attrs, icon_name, label):
	return block(
		tag,
		label,
		["cafe-menu-item"],
		attrs={**attrs, "role": "menuitem"},
		children=[icon(icon_name, 16, MUTED), block("span", "Label", text=label)],
		styles=MENU_ITEM_STYLES,
	)


def build_bottom_nav():
	return block(
		"nav",
		"Bottom nav",
		["cafe-bottom-nav"],
		attrs={"aria-label": "Main"},
		children=[tab_item_block(*item) for item in TAB_ITEMS],
		styles={"display": "none"},
	)


def build_logo_menu():
	return block(
		"div",
		"Logo menu",
		["cafe-menu"],
		attrs={"id": "cafe-menu", "role": "menu"},
		children=[
			menu_item_block("a", {"href": "/settings"}, "settings", "Settings"),
			menu_item_block("button", {"id": "cafe-logout", "type": "button"}, "log-out", "Logout"),
		],
		styles=MENU_STYLES,
	)


def build_shell():
	# display: contents keeps the Shell wrapper itself out of the page layout:
	# the nav, bottom nav and menu all stay direct flex children of the app
	# container underneath it.
	children = [build_nav(), build_bottom_nav(), build_logo_menu()]
	return block("div", "Shell", ["cafe-shell"], children=children, styles={"display": "contents"})
