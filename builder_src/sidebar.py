"""The nav: a single set of blocks that is a 50px icon rail by default and a
224px labeled sidebar when expanded - one element, not two swapped or
width-animated side by side. styles.css drives both the container's width and
each label's width/opacity off one attribute on <html> (set in shell.js), the
same mechanism frappe-ui's own Sidebar.vue uses (transition-[width]
duration-300 ease-in-out on the container; the icon's own alignment snaps
instantly between centered and left, same as frappe-ui - only the label and
the container width ease).

Individual native blocks, same as the rest of the shell: each item is its own
block, editable on its own in Builder's canvas."""

from blocks import INK, SURFACE_1, block, cafe_logo, icon
from shell_component_parts import BADGE_STYLES

GRAY_6 = "var(--ink-gray-6)"
# marginLeft is constant, not state-dependent: collapsed, the label has zero
# max-width anyway (see styles.css), so the gap it would open up next to the
# icon is invisible; expanded, it's the icon-to-label gap. One fewer property
# for styles.css to toggle - and one fewer thing that can visibly snap.
LABEL_STYLES = {
	"fontSize": "13px",
	"fontWeight": "420",
	"letterSpacing": "0.02em",
	"lineHeight": "1.15",
	"color": "inherit",
	"whiteSpace": "nowrap",
	"marginLeft": "8px",
}
# paddingLeft is constant too, not state-dependent: for a 16px icon inside
# this 34px-wide collapsed item (nav's 50px minus the Items row's own 8px
# side padding, times two), 8px already centers it within a pixel; expanded,
# it's the same "pl-2" frappe-ui itself uses. The icon's position never
# changes between states - see styles.css for why that matters.
ITEM_STYLES = {
	"position": "relative",
	"display": "flex",
	"alignItems": "center",
	"width": "100%",
	"height": "28px",
	"paddingLeft": "8px",
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
	children = [icon(icon_name, 16), block("span", "Label", ["cafe-nav-label"], text=label, styles=LABEL_STYLES)]
	if key in ("messages", "notifications"):
		children.append(
			block("span", "Count", ["cafe-badge"], attrs={"data-badge": key}, styles=COUNT_STYLES)
		)
	# data-tooltip starts equal to aria-label (both the same text) so
	# CAFE.autoTooltips() wires every item at page load; shell.js then removes
	# data-tooltip (not aria-label) whenever the sidebar is expanded, since the
	# label span next to the icon already shows the same text then - a
	# tooltip repeating it would be redundant (frappe-ui's own SidebarItem
	# disables its tooltip the same way: :disabled="!isCollapsed").
	attrs = {"data-nav": key, "aria-label": label, "data-tooltip": label, "data-tooltip-side": "right"}
	if href:
		return block(
			"a",
			label,
			["cafe-nav-item"],
			attrs={**attrs, "href": href},
			children=children,
			styles=ITEM_STYLES,
		)
	return block(
		"button",
		label,
		["cafe-nav-item"],
		attrs={**attrs, "type": "button", "data-bell": ""},
		children=children,
		styles=ITEM_STYLES,
	)


def nav_logo_block():
	return block(
		"button",
		"Logo",
		["cafe-nav-logo"],
		attrs={"type": "button", "aria-label": "Cafe menu", "aria-haspopup": "menu", "data-logo": ""},
		children=[
			cafe_logo(32),
			block(
				"span",
				"Name",
				["cafe-nav-label"],
				text="Cafe",
				styles={
					"fontSize": "14px",
					"fontWeight": "500",
					"letterSpacing": "0.015em",
					"lineHeight": "1.15",
					"color": INK,
					"whiteSpace": "nowrap",
					"marginLeft": "8px",
				},
			),
		],
		styles={
			"position": "relative",
			"display": "flex",
			"alignItems": "center",
			"width": "100%",
			"height": "40px",
			# A 32px mark, not 16px like every other icon - the padding that
			# centers it in the collapsed rail is different math (34px
			# available inside this row's own 8px padding, so (34-32)/2), not
			# the 8px ITEM_STYLES uses for a 16px icon. Constant either way,
			# same reasoning as ITEM_STYLES's paddingLeft.
			"paddingLeft": "1px",
			"border": "0",
			"borderRadius": "8px",
			"backgroundColor": "transparent",
			"cursor": "pointer",
			"color": INK,
		},
	)


def toggle_block():
	"""The nav's own bottom button - one button that flips the current state
	(shell.js), rather than a separate open button and close button. Its
	label only ever shows expanded (the one time the button reads
	"Collapse"), so it needs no text swap; the icon's 180deg rotation
	(styles.css) says "expand" when collapsed, same as the old two-button
	version's icon did. Its aria-label/tooltip start matching the default
	collapsed look ("Expand sidebar") - unlike every other item, what this
	one DOES flips with the state, so shell.js swaps its text too, not just
	whether it's shown."""
	return block(
		"button",
		"Toggle",
		["cafe-nav-item", "cafe-nav-toggle"],
		attrs={
			"type": "button",
			"aria-label": "Expand sidebar",
			"data-tooltip": "Expand sidebar",
			"data-tooltip-side": "right",
			"data-sidebar-toggle": "",
		},
		children=[icon("panel-right-open", 16), block("span", "Label", ["cafe-nav-label"], text="Collapse", styles=LABEL_STYLES)],
		styles=ITEM_STYLES,
	)


def build_nav():
	content = block(
		"div",
		"Nav content",
		["cafe-nav-content"],
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
				children=[nav_logo_block()],
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
				"Toggle row",
				styles={"marginTop": "auto", "padding": "0 8px 8px"},
				children=[toggle_block()],
			),
		],
	)
	return block(
		"nav",
		"Nav",
		["cafe-nav"],
		attrs={"aria-label": "Main"},
		styles={
			"flexShrink": "0",
			"width": "50px",
			"overflow": "hidden",
			"backgroundColor": SURFACE_1,
		},
		children=[content],
	)
