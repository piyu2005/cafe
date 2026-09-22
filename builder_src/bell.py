"""The notification bell of the phone's top bars. It opens the panel that
notifications.js builds; the badge is filled with the unread count."""

from blocks import INK, html_el, svg
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
