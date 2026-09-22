"""The notification bell of the phone's top bars. It opens the panel that
notifications.js builds; the badge is filled with the unread count."""

from blocks import INK, block, html_el, icon, svg
from shell_component import BADGE_STYLES

BELL_STYLES = {
	"position": "relative",
	"display": "grid",
	"placeItems": "center",
	"flexShrink": "0",
	"width": "28px",
	"height": "28px",
	"padding": "0",
	"border": "0",
	"borderRadius": "8px",
	"color": INK,
	"cursor": "pointer",
}


def mobile_bell():
	badge = html_el(
		"span",
		["cafe-badge"],
		{"data-badge": "notifications"},
		{**BADGE_STYLES, "top": "-2px", "right": "-2px"},
	)
	return html_el(
		"button",
		["cafe-bell"],
		{"type": "button", "aria-label": "Notifications", "data-bell": ""},
		BELL_STYLES,
		[svg("bell", 16), badge],
	)


def mobile_bell_block():
	"""Same bell as mobile_bell(), built as individual Builder blocks instead
	of one embedded HTML string."""
	badge = block(
		"span",
		classes=["cafe-badge"],
		attrs={"data-badge": "notifications"},
		styles={**BADGE_STYLES, "top": "-2px", "right": "-2px"},
	)
	return block(
		"button",
		classes=["cafe-bell"],
		attrs={"type": "button", "aria-label": "Notifications", "data-bell": ""},
		styles=BELL_STYLES,
		children=[icon("bell", 16), badge],
	)
