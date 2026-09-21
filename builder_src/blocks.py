"""Helpers that build Builder blocks. Shared by the shell and every page."""

import html as htmllib
import random
import re
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
LUCIDE = REPO / "vendor_src" / "node_modules" / "lucide-static" / "icons"

_ids = random.Random("cafe.builder")


def block_id():
	return "".join(_ids.choices("0123456789abcdefghijklmnopqrstuvwxyz", k=9))


INK = "#171717"
INK_BLACK = "#0f0f0f"
MUTED = "#7c7c7c"
OUTLINE = "#ededed"
SURFACE_1 = "#f8f8f8"
SURFACE_2 = "#f3f3f3"
DIALOG_SHADOW = "0 0 0 1px rgba(0, 0, 0, 0.08), 0 8px 24px rgba(0, 0, 0, 0.12)"


def block(
	element,
	name=None,
	classes=(),
	attrs=None,
	custom=None,
	text=None,
	children=(),
	html=None,
	styles=None,
	inner_html=None,
):
	"""`styles` are the block's static CSS (camelCase keys, as Builder stores them).
	`text` is plain text, shown by Builder as the block's innerHTML. `html` is
	raw markup (used for svg icons) and is marked as a raw-html block."""
	if text is not None:
		html_content, raw = htmllib.escape(text), False
	elif inner_html is not None:
		html_content, raw = inner_html, False  # markup inside a normal block, so it can still have a binding
	else:
		html_content, raw = html, bool(html)
	return {
		"attributes": attrs or {},
		"baseStyles": styles or {},
		"blockId": block_id(),
		"blockName": name,
		"children": list(children),
		"classes": list(classes),
		"clientScript": {},
		"customAttributes": custom or {},
		"dataKey": None,
		"draggable": False,
		"dynamicValues": [],
		"element": element,
		"elementBeforeConversion": None,
		"extendedFromComponent": None,
		"innerHTML": html_content,
		"isChildOfComponent": None,
		"isRepeaterBlock": False,
		"mobileStyles": {},
		"originalElement": "__raw_html__" if raw else None,
		"props": {},
		"rawStyles": {},
		"referenceBlockId": None,
		"tabletStyles": {},
		"visibilityCondition": None,
	}


def icon(name, size, color=None, styles=None):
	"""A lucide icon as an inline svg. Builder wraps it in a div, and that div
	carries the size, so the svg just fills it. The stroke is 1.5, not lucide's
	2, because that is what frappe-ui draws."""
	source = (LUCIDE / f"{name}.svg").read_text()
	inner = re.search(r"<svg[^>]*>(.*)</svg>", source, re.S).group(1).strip()
	markup = (
		'<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 24 24" fill="none" '
		'stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" '
		f'aria-hidden="true" style="display:block">{inner}</svg>'
	)
	box = {"width": f"{size}px", "height": f"{size}px", "flexShrink": "0"}
	if color:
		box["color"] = color
	return block("svg", f"icon/{name}", html=markup, styles={**box, **(styles or {})})


# ---- Plain HTML, for parts made of many small elements ----
#
# Builder renders every block through a template that it compiles again on each
# request, at about 1-2 ms per block. A part with dozens of tiny elements (the
# app shell) is far cheaper as one block that holds ready-made HTML. The styles
# go inline, because the editor canvas shows only what is on the element itself.


def kebab(name):
	return re.sub(r"([A-Z])", lambda m: "-" + m.group(1).lower(), name)


def css(styles):
	return ";".join(f"{kebab(key)}:{value}" for key, value in (styles or {}).items())


VOID_TAGS = {"input", "img", "br", "hr"}


def html_el(tag, classes=(), attrs=None, styles=None, children=(), text=None):
	"""One HTML element as a string. `children` are strings from html_el or svg."""
	parts = []
	if classes:
		parts.append(f'class="{htmllib.escape(" ".join(classes), quote=True)}"')
	for key, value in (attrs or {}).items():
		parts.append(f'{key}="{htmllib.escape(str(value), quote=True)}"')
	if styles:
		parts.append(f'style="{htmllib.escape(css(styles), quote=True)}"')
	if tag in VOID_TAGS:
		return f"<{tag} {' '.join(parts)}>"
	inner = htmllib.escape(text) if text is not None else "".join(children)
	return f"<{tag} {' '.join(parts)}>{inner}</{tag}>"


def raw_block(name, inner_html, classes=(), styles=None):
	"""A block that holds ready-made HTML. Use it for a static cluster of small
	elements; anything with a data binding must stay a normal block. Builder
	puts the HTML inside a div, which carries `styles`."""
	return block("div", name, classes, html=inner_html, styles=styles)


def svg(name, size, color=None):
	"""A lucide icon as an inline svg of a fixed size (stroke 1.5, like frappe-ui)."""
	source = (LUCIDE / f"{name}.svg").read_text()
	inner = re.search(r"<svg[^>]*>(.*)</svg>", source, re.S).group(1).strip()
	style = f"display:block;flex-shrink:0;width:{size}px;height:{size}px" + (
		f";color:{color}" if color else ""
	)
	return (
		f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 24 24" fill="none" '
		'stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" '
		f'aria-hidden="true" style="{style}">{inner}</svg>'
	)


def instance_of(component_id, component_block, name):
	"""A page's reference to a component. Builder rebuilds the children of a
	component from the instance's children, matched by `referenceBlockId`, so
	the instance needs one empty child per child of the component."""

	def mirror(source):
		node = block(None, children=[mirror(child) for child in source.get("children") or []])
		node["isChildOfComponent"] = component_id
		node["referenceBlockId"] = source["blockId"]
		return node

	node = block(None, name=name, children=[mirror(c) for c in component_block.get("children") or []])
	node["extendedFromComponent"] = component_id
	return node


def bind(key, prop, kind):
	"""A binding of a block property to a key of the data script's data. Inside a
	repeater the key is looked up on the current item."""
	return {"comesFrom": "dataScript", "key": key, "property": prop, "type": kind}


# ---- Colours and small helpers shared by the pages ----

GRAY_6 = "#525252"
GRAY_7 = "#383838"
GRAY_4 = "#999999"
BUTTON_BORDER = "#e2e2e2"
NBSP = "\u00a0"


def text_style(size, weight="420", color=INK, spacing="0.02em", line="1.15", **extra):
	return {
		"fontSize": f"{size}px",
		"fontWeight": weight,
		"color": color,
		"letterSpacing": spacing,
		"lineHeight": line,
		**extra,
	}


def when(node, key):
	"""Render the block only when the data script's `key` is truthy."""
	node["visibilityCondition"] = {"key": key, "comesFrom": "dataScript"}
	return node


def show(node, key, prop="innerHTML"):
	"""Fill a block property from a key of the data script's data."""
	node["dynamicValues"] = [*node["dynamicValues"], bind(key, prop, "key")]
	return node


def attribute(node, key, prop):
	node["dynamicValues"] = [*node["dynamicValues"], bind(key, prop, "attribute")]
	return node


def label(text, name=None, **style):
	return block("span", name, text=text, styles=style or None)
