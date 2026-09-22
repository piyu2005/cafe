"""The Settings page: /settings, for phones.

On a desktop, Settings is a dialog that opens over whatever page you are on
(see settings.js, which every page loads). This page is what a phone gets: two
tabs, Account and Saved. Someone who opens /settings on a desktop is sent to
the Home feed with the dialog open, like the old app does.

The Account rows are blocks with the username and email from the data script.
The Saved list is filled by settings.js when its tab opens. Everything here is
built as individual Builder blocks (buttons, tabs, list placeholders), not one
embedded HTML blob, so each piece is editable on its own in Builder's canvas."""

from blocks import GRAY_6, INK, MUTED, OUTLINE, SURFACE_2, attribute, block, html_el, show, text_style
from layout import crumb_current, crumb_link, crumb_separator, page_layout
from posts_page import TAB_STYLES

ROW_STYLES = {
	"display": "flex",
	"alignItems": "center",
	"justifyContent": "space-between",
	"gap": "32px",
	"padding": "14px 0",
}
TITLE_STYLES = text_style(14, "500", INK, "0.015em")
DESCRIPTION_STYLES = {"marginTop": "4px", **text_style(14, "420", GRAY_6, "0.02em", "20px")}
VALUE_STYLES = text_style(14, "420", GRAY_6)
BUTTON_STYLES = {
	"display": "inline-flex",
	"alignItems": "center",
	"height": "28px",
	"padding": "0 8px",
	"border": "0",
	"borderRadius": "8px",
	"whiteSpace": "nowrap",
	"fontSize": "14px",
	"fontWeight": "420",
	"letterSpacing": "0.02em",
	"cursor": "pointer",
}
LOG_OUT_STYLES = {**BUTTON_STYLES, "backgroundColor": SURFACE_2, "color": INK}
DELETE_STYLES = {**BUTTON_STYLES, "backgroundColor": "#fde7e7", "color": "#f79596", "cursor": "not-allowed"}


def build_row(name, title, control, description=None, first=False):
	"""One line of the Account tab: the title (and a description) on the left,
	the value or button on the right. The lines are separated by a rule."""
	# Spans, not divs: the editor canvas draws the text of a span but not of a div.
	text = [block("span", "Title", text=title, styles={"display": "block", **TITLE_STYLES})]
	if description:
		text.append(
			block("span", "Description", text=description, styles={"display": "block", **DESCRIPTION_STYLES})
		)
	styles = dict(ROW_STYLES)
	if not first:
		styles["borderTop"] = f"1px solid {OUTLINE}"
	return block(
		"div",
		name,
		["cafe-set-row-page"],
		styles=styles,
		children=[block("div", "Text", styles={"minWidth": "0"}, children=text), control],
	)


def build_account_panel():
	username = show(block("span", "Username value", text="@username", styles=VALUE_STYLES), "st.username")
	email = show(block("span", "Email value", text="you@example.com", styles=VALUE_STYLES), "st.email")
	log_out_button = block(
		"button",
		"Log out button",
		classes=["cafe-btn"],
		attrs={"id": "cafe-settings-logout", "type": "button"},
		styles=LOG_OUT_STYLES,
		text="Log out",
	)
	log_out = block("div", "Log out button", styles={"flexShrink": "0"}, children=[log_out_button])
	delete_button = block(
		"button",
		"Delete account button",
		attrs={"type": "button", "disabled": "disabled"},
		styles=DELETE_STYLES,
		text="Delete account",
	)
	delete = block("div", "Delete account button", styles={"flexShrink": "0"}, children=[delete_button])
	return block(
		"div",
		"Account panel",
		attrs={"id": "cafe-settings-account", "role": "tabpanel"},
		styles={"paddingTop": "16px"},
		children=[
			build_row("Username", "Username", username, first=True),
			build_row("Email", "Email address", email),
			build_row("Log out", "Log out", log_out, "Sign out of your account on this device."),
			build_row(
				"Delete account",
				"Delete account",
				delete,
				"Temporarily unavailable. Contact support if you need this.",
			),
		],
	)


def build_saved_panel():
	# The 4 skeleton rows are a repeated decorative loading state, not
	# interactive content - one raw-html block for the group is far cheaper
	# to render than 5 native ones for something nobody ever edits piece by
	# piece (see blocks.py's note on raw_block for exactly this shape).
	skeleton = "".join(
		html_el(
			"div",
			["cafe-skeleton"],
			None,
			{"height": "80px", "borderRadius": "10px", "backgroundColor": SURFACE_2},
		)
		for _ in range(4)
	)
	loading = block(
		"div",
		"Loading",
		classes=["cafe-loading"],
		attrs={"hidden": "hidden"},
		html=skeleton,
		styles={"flexDirection": "column", "gap": "20px"},
	)
	empty = block(
		"p",
		classes=["cafe-saved-empty"],
		attrs={"hidden": "hidden"},
		styles={"margin": "0", **text_style(14, "420", GRAY_6, "0.02em", "1.5")},
		text="No saved posts yet.",
	)
	error = block(
		"p",
		classes=["cafe-saved-error"],
		attrs={"hidden": "hidden"},
		styles={"margin": "0", **text_style(14, "420", MUTED, "0.02em", "1.5")},
		text="Couldn't load your saved posts. Please try again.",
	)
	saved_list = block("div", classes=["cafe-saved-list"])
	return block(
		"div",
		"Saved panel",
		attrs={"id": "cafe-settings-saved", "role": "tabpanel", "hidden": "hidden"},
		styles={"paddingTop": "16px"},
		children=[loading, empty, error, saved_list],
	)


def build_tabs():
	buttons = [
		block(
			"button",
			classes=["cafe-tab-btn"],
			attrs={
				"type": "button",
				"role": "tab",
				"data-tab": key,
				"aria-selected": "true" if key == "account" else "false",
			},
			styles=TAB_STYLES,
			text=label,
		)
		for key, label in (("account", "Account"), ("saved", "Saved"))
	]
	return block(
		"div",
		"Tabs",
		classes=["cafe-tablist"],
		attrs={"role": "tablist"},
		styles={"display": "flex", "gap": "32px", "borderBottom": f"1px solid {OUTLINE}"},
		children=buttons,
	)


def build_settings(shell_id, shell_block):
	root = block(
		"div",
		"Settings",
		attrs={"id": "cafe-settings-page"},
		custom={"data-admin": ""},
		children=[build_tabs(), build_account_panel(), build_saved_panel()],
	)
	root = attribute(root, "st.admin", "data-admin")
	crumbs = [crumb_link("Cafe", "/"), crumb_separator(), crumb_current("Settings")]
	return page_layout(shell_id, shell_block, crumbs, [root], "600px", padding="24px 16px")


# ---- Data script ----
# The username is the part of the email before the "@", as in the old app.
SETTINGS_DATA_SCRIPT = """\
if frappe.session.user == "Guest":
    redirect("/login?redirect=/settings")

email = frappe.session.user
data.st = {
    "username": frappe.utils.escape_html("@" + email.split("@")[0]),
    "email": frappe.utils.escape_html(email),
    # Builder draws the folder thumbnail as this user, and has no address for a redirect to use.
    "admin": "1" if email == "Administrator" else "",
}
"""
