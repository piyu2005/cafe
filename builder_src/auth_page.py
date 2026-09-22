"""The Login and Signup pages: /login and /signup.

Both are a centered card on a grey page, with no app shell. The forms are
plain HTML, and auth.js runs them: it sends the email code, checks it and
signs you in. Nothing about the sign-in itself lives here: the whitelisted
methods that send and check the codes are the whitelisted ones in cafe/api.py.

/login?redirect-to=... is where Frappe sends someone who opens the Desk while
signed out. That gets a separate card with a username and password, since
system users have no email code."""

from blocks import (
	INK,
	INK_BLACK,
	MUTED,
	OUTLINE,
	SURFACE_1,
	SURFACE_2,
	block,
	html_el,
	raw_block,
	svg,
	text_style,
	when,
)

GOOGLE_ICON = (
	'<svg viewBox="0 0 48 48" width="16" height="16" aria-hidden="true" style="display:block;flex-shrink:0">'
	'<path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6.1 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.5z"/>'
	'<path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.6 15.9 18.9 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6.1 29.6 4 24 4 16.3 4 9.6 8.3 6.3 14.7z"/>'
	'<path fill="#4CAF50" d="M24 44c5.5 0 10.4-2.1 14.1-5.6l-6.5-5.5C29.6 34.7 26.9 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/>'
	'<path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.4l6.5 5.5C41.5 35.7 44 30.4 44 24c0-1.3-.1-2.7-.4-3.5z"/></svg>'
)
ERROR_RED = "#b41d1d"
LINK_STYLES = {"fontWeight": "500", "color": INK_BLACK, "textDecoration": "underline"}
SMALL = text_style(13, "420", MUTED, "0.02em", "1.15")

PAGE_STYLES = {
	"display": "flex",
	"alignItems": "center",
	"justifyContent": "center",
	"width": "100%",
	"minHeight": "100vh",
	"padding": "0 16px",
	"backgroundColor": SURFACE_1,
	**text_style(14, "420", INK_BLACK, "0.02em", "1.15"),
}
CARD_STYLES = {
	"width": "100%",
	"maxWidth": "472px",
	"padding": "36px",
	"border": f"1px solid {OUTLINE}",
	"borderRadius": "12px",
	"backgroundColor": "#ffffff",
	"boxShadow": "0 1px 2px 0 rgba(0, 0, 0, 0.05)",
}
LOGO_STYLES = {
	"display": "grid",
	"placeItems": "center",
	"width": "36px",
	"height": "36px",
	"marginBottom": "12px",
	"borderRadius": "16px",
	"backgroundColor": INK,
	"color": "#ffffff",
}
INPUT_STYLES = {
	"display": "block",
	"width": "100%",
	"height": "28px",
	"padding": "6px 8px",
	"border": f"1px solid {SURFACE_2}",
	"borderRadius": "8px",
	"outline": "none",
	"backgroundColor": SURFACE_2,
	"color": INK,
	"fontSize": "14px",
	"letterSpacing": "0.02em",
}
OTP_STYLES = {
	"width": "48px",
	"height": "48px",
	"padding": "8px 12px",
	"border": "1px solid #e2e2e2",
	"borderRadius": "10px",
	"outline": "none",
	"backgroundColor": "#ffffff",
	"color": INK_BLACK,
	"textAlign": "center",
	"fontSize": "16px",
	"fontWeight": "500",
	"letterSpacing": "0.015em",
}


def field(name, label, input_type, placeholder, autocomplete, first=False, autofocus=False):
	"""A label and a text box, like frappe-ui's FormControl."""
	attrs = {
		"id": f"cafe-{name}",
		"name": name,
		"type": input_type,
		"placeholder": placeholder,
		"autocomplete": autocomplete,
		"required": "required",
	}
	if autofocus:
		attrs["autofocus"] = "autofocus"
	star = html_el("span", None, None, {"color": "#e03434"}, text=" *")
	title = html_el(
		"label",
		None,
		{"for": f"cafe-{name}"},
		{"display": "block", "marginBottom": "6px", **text_style(14, "420", MUTED)},
		[html_el("span", text=label), star],
	)
	box = html_el("input", ["cafe-auth-input"], attrs, INPUT_STYLES)
	return html_el("div", None, None, {} if first else {"marginTop": "16px"}, [title, box])


def message(name, hidden=True, text=None):
	"""A line that JavaScript fills, hidden while it is empty."""
	attrs = {"id": f"cafe-{name}", "role": "alert"}
	if hidden:
		attrs["hidden"] = "hidden"
	return html_el(
		"div",
		["cafe-auth-error"],
		attrs,
		{"marginTop": "12px", **text_style(13, "420", ERROR_RED)},
		text=text,
	)


BUTTON_STYLES = {
	"display": "flex",
	"alignItems": "center",
	"justifyContent": "center",
	"gap": "8px",
	"width": "100%",
	"height": "28px",
	"padding": "0 8px",
	"borderRadius": "8px",
	"fontSize": "14px",
	"letterSpacing": "0.02em",
	"cursor": "pointer",
}
SOLID_STYLES = {
	**BUTTON_STYLES,
	"marginTop": "16px",
	"border": "0",
	"backgroundColor": INK,
	"color": "#ffffff",
}
OUTLINE_STYLES = {
	**BUTTON_STYLES,
	"marginTop": "8px",
	"border": "1px solid #e2e2e2",
	"backgroundColor": "#ffffff",
	"color": INK,
}


def button(label, kind, attrs=None, before=""):
	"""The full-width button of the form: solid submits, outline does not."""
	styles = SOLID_STYLES if kind == "solid" else OUTLINE_STYLES
	attrs = {"type": "submit" if kind == "solid" else "button", **(attrs or {})}
	return html_el("button", [f"cafe-auth-btn-{kind}"], attrs, styles, [before, html_el("span", text=label)])


def google_button():
	return button("Continue with Google", "outline", {"id": "cafe-google"}, GOOGLE_ICON)


def code_form(sent_text="We sent a 6 digit verification code to "):
	boxes = "".join(
		html_el(
			"input",
			["cafe-otp"],
			{
				"type": "text",
				"inputmode": "numeric",
				"autocomplete": "one-time-code",
				"maxlength": "1",
				"aria-label": f"Digit {i + 1}",
			},
			OTP_STYLES,
		)
		for i in range(6)
	)
	sent = html_el(
		"p",
		None,
		None,
		{"margin": "0", **text_style(13, "420", MUTED, "0.015em", "19.5px")},
		[html_el("span", text=sent_text), html_el("span", None, {"id": "cafe-sent-to"}, None)],
	)
	resend = html_el("p", ["cafe-resend"], None, {"margin": "12px 0 0", "textAlign": "center", **SMALL})
	return html_el(
		"form",
		None,
		{"id": "cafe-code-form", "hidden": "hidden", "novalidate": "novalidate"},
		None,
		[
			sent,
			html_el("div", None, None, {"display": "flex", "gap": "8px", "marginTop": "16px"}, [boxes]),
			message("code-error"),
			button("Verify", "solid", {"id": "cafe-verify"}),
			resend,
		],
	)


def footer(prefix, link_label, href):
	link = html_el("a", ["cafe-auth-link"], {"href": href}, LINK_STYLES, text=link_label)
	return html_el(
		"div",
		None,
		None,
		{"marginTop": "24px", "textAlign": "center", **SMALL},
		[html_el("span", text=prefix + " " if prefix else ""), link],
	)


def card(title, subtitle, content, footer_html):
	head = [
		raw_block("Logo", svg("feather", 16), styles=LOGO_STYLES),
		block(
			"h1",
			"Title",
			text=title,
			styles={"margin": "0", **text_style(17, "600", INK_BLACK, "0.02em", "1.15")},
		),
		block(
			"p",
			"Subtitle",
			text=subtitle,
			styles={"margin": "4px 0 0", **text_style(13, "420", MUTED, "0.15px", "19.5px")},
		),
	]
	return block(
		"div",
		"Card",
		["cafe-auth-card"],
		styles=CARD_STYLES,
		children=[
			*head,
			raw_block("Form", content, styles={"marginTop": "24px"}),
			raw_block("Footer", footer_html),
		],
	)


def login_card():
	email_form = html_el(
		"form",
		None,
		{"id": "cafe-email-form", "novalidate": "novalidate"},
		None,
		[
			field("email", "Email", "email", "name@example.com", "email", first=True, autofocus=True),
			message("email-error"),
			html_el(
				"p",
				["cafe-signup-hint"],
				{"hidden": "hidden"},
				{"margin": "8px 0 0", **SMALL},
				[html_el("a", ["cafe-auth-link"], {"href": "/signup"}, LINK_STYLES, text="Create one.")],
			),
			button("Send verification code", "solid", {"id": "cafe-send"}),
			google_button(),
		],
	)
	return card(
		"Log in to Cafe",
		"Write, share, and connect.",
		email_form + code_form(),
		footer("New member?", "Create a new account.", "/signup"),
	)


def signup_card():
	details = html_el(
		"form",
		None,
		{"id": "cafe-email-form", "novalidate": "novalidate"},
		None,
		[
			field("username", "Username", "text", "janedoe", "username", first=True, autofocus=True),
			field("email", "Email", "email", "name@example.com", "email"),
			message("email-error"),
			button("Send verification code", "solid", {"id": "cafe-send"}),
			google_button(),
		],
	)
	return card(
		"Create your account",
		"Write, share, and connect — without the noise.",
		details + code_form(),
		footer("Already have an account?", "Log in.", "/login"),
	)


def system_card():
	form = html_el(
		"form",
		None,
		{"id": "cafe-system-form", "novalidate": "novalidate"},
		None,
		[
			field("usr", "Username", "text", "Administrator", "username", first=True, autofocus=True),
			field("pwd", "Password", "password", "", "current-password"),
			message("system-error"),
			button("Log in", "solid", {"id": "cafe-system-login"}),
		],
	)
	return card("System login", "For Frappe Desk access.", form, footer("", "Back to Cafe login.", "/login"))


def build_page(cards):
	auth = block("div", "Auth", ["cafe-auth"], attrs={"id": "cafe-auth"}, styles=PAGE_STYLES, children=cards)
	root = block("div", None, children=[auth])
	root["blockId"] = "root"
	root["originalElement"] = "body"
	return [root]


def build_login(shell_id, shell_block):
	return build_page([when(login_card(), "lg.member"), when(system_card(), "lg.system")])


def build_signup(shell_id, shell_block):
	return build_page([signup_card()])


# A signed-in visitor has nothing to do here. The Desk's own redirect to
# /login?redirect-to=... asks for the password card.
LOGIN_DATA_SCRIPT = """\
# The Administrator is let through: Builder makes the folder thumbnails as that user.
if frappe.session.user not in ("Guest", "Administrator"):
    redirect("/")

system = bool(frappe.form_dict.get("redirect-to"))
data.lg = {"system": system, "member": not system}
"""

SIGNUP_DATA_SCRIPT = """\
# The Administrator is let through: Builder makes the folder thumbnails as that user.
if frappe.session.user not in ("Guest", "Administrator"):
    redirect("/")
"""
