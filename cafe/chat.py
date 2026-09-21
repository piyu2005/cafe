import ipaddress
import mimetypes
import re
import socket
import urllib.request
from urllib.parse import quote, urlparse

import frappe
from frappe import _
from frappe.utils import now_datetime

from cafe.api import _check_post_visible
from cafe.follow import _notify

URL_RE = re.compile(r"(https?://[^\s]+)")
HTML_TAG_RE = re.compile(r"<[^>]*>")
# Mentions render as `<span class="mention" data-type="mention" data-id="...">`
# (frappe-ui's Mention node) — attribute order isn't guaranteed, so match the
# whole opening tag first, then pull data-id out of that.
MENTION_SPAN_RE = re.compile(r'<span[^>]*class="mention"[^>]*>', re.I)
DATA_ID_RE = re.compile(r'data-id="([^"]*)"')


def _extract_mentions(content):
	if not content:
		return []
	ids = []
	for span in MENTION_SPAN_RE.findall(content):
		match = DATA_ID_RE.search(span)
		if match and match.group(1):
			ids.append(match.group(1))
	return ids


def _preview_text(content):
	"""Plain-text preview for conversation/search listings — messages composed
	with the rich-text composer store HTML, which shouldn't leak into a
	one-line snippet."""
	if not content:
		return content
	stripped = HTML_TAG_RE.sub(" ", content)
	return re.sub(r"\s+", " ", stripped).strip() or None


def _conversation_list_preview(last_message):
	"""One-line summary for the conversation list sidebar. A message with no
	text — an attachment-only image/file, a shared post, or a poll — still
	has a real `content` of None, which _preview_text correctly turns into
	None too; falling straight through to the caller's own "No messages
	yet" text then would be wrong for a conversation that does have a
	message, just not a text one. Named after whichever kind of payload
	it actually carries instead."""
	if not last_message:
		return None
	if last_message.is_deleted:
		return "This message was deleted"
	preview = _preview_text(last_message.content)
	if preview:
		return preview
	if last_message.shared_post:
		return "Shared a post"
	if last_message.poll:
		return "Sent a poll"
	if last_message.has_attachment:
		return "Sent an attachment"
	return None


def _is_member(conversation, user=None):
	user = user or frappe.session.user
	return frappe.db.exists("Conversation Member", {"conversation": conversation, "user": user})


def _require_member(conversation):
	if not _is_member(conversation):
		frappe.throw(_("Not permitted"), frappe.PermissionError)


def _is_admin(conversation, user=None):
	user = user or frappe.session.user
	return bool(
		frappe.db.get_value("Conversation Member", {"conversation": conversation, "user": user}, "is_admin")
	)


def _require_admin(conversation):
	_require_member(conversation)
	if not _is_admin(conversation):
		frappe.throw(_("Only group admins can do this"), frappe.PermissionError)


def _is_blocked(user_a, user_b):
	return bool(
		frappe.db.exists("Blocked User", {"blocker": user_a, "blocked": user_b})
		or frappe.db.exists("Blocked User", {"blocker": user_b, "blocked": user_a})
	)


def _other_members(conversation, exclude=None):
	exclude = exclude or frappe.session.user
	rows = frappe.db.get_all("Conversation Member", filters={"conversation": conversation}, fields=["user"])
	return [r.user for r in rows if r.user != exclude]


def _dm_display_info(other_user):
	"""Resolve a DM's "other person" for display — a Conversation Member row
	is never cleaned up if that User is later deleted directly (e.g. via
	Desk; this app's own account deletion only disables, never hard-deletes,
	precisely to avoid this), so `other_user` here can be a dangling id with
	no actual User behind it. Treating that id as still-valid would show a
	blank name/avatar and, worse, link to a profile that 404s - `other_user`
	comes back None here (same convention already used for group chats,
	where there's no single other person to link to) so the frontend has
	nothing broken to link, while the conversation and its history stay
	intact and visibly say what happened.
	"""
	if not other_user or not frappe.db.exists("User", other_user):
		return None, "Deleted user", None
	display_name = frappe.db.get_value("User", other_user, "full_name")
	display_image = frappe.db.get_value("User", other_user, "user_image")
	return other_user, display_name, display_image


def _reply_preview(reply_to):
	"""Small quoted-preview payload for a message's reply_to, used both when
	sending a new reply and when loading history. Reads sender_name/content
	directly rather than checking membership again - reply_to is only ever
	set by send_message, which already validated the target belongs to this
	same conversation (see there), so anyone able to see this message is
	already someone who was allowed to see the one it's quoting."""
	if not reply_to:
		return None
	msg = frappe.db.get_value("Message", reply_to, ["sender_name", "content", "is_deleted"], as_dict=True)
	if not msg:
		return None
	return {
		"name": reply_to,
		"sender_name": msg.sender_name,
		"content": None if msg.is_deleted else _preview_text(msg.content),
		"is_deleted": msg.is_deleted,
	}


def _group_reactions(message):
	reactions = frappe.db.get_all("Message Reaction", filters={"message": message}, fields=["emoji", "user"])
	grouped = {}
	for r in reactions:
		grouped.setdefault(r.emoji, []).append(r.user)
	return [
		{"emoji": emoji, "count": len(users), "reacted_by_me": frappe.session.user in users}
		for emoji, users in grouped.items()
	]


def _reactions_by_message(names):
	"""Batched form of _group_reactions for a whole message list (get_messages)
	- one query for every message's reactions instead of one query per
	message, same idea as _attachments_by_message just below."""
	if not names:
		return {}
	rows = frappe.db.get_all(
		"Message Reaction", filters={"message": ["in", names]}, fields=["message", "emoji", "user"]
	)
	by_message = {}
	for r in rows:
		by_message.setdefault(r.message, {}).setdefault(r.emoji, []).append(r.user)
	return {
		name: [
			{"emoji": emoji, "count": len(users), "reacted_by_me": frappe.session.user in users}
			for emoji, users in emojis.items()
		]
		for name, emojis in by_message.items()
	}


def _reply_previews_by_ids(reply_to_ids):
	"""Batched form of _reply_preview for a whole message list (get_messages)
	- one query for every quoted message instead of one query per reply."""
	if not reply_to_ids:
		return {}
	rows = frappe.db.get_all(
		"Message",
		filters={"name": ["in", reply_to_ids]},
		fields=["name", "sender_name", "content", "is_deleted"],
	)
	return {
		r.name: {
			"name": r.name,
			"sender_name": r.sender_name,
			"content": None if r.is_deleted else _preview_text(r.content),
			"is_deleted": r.is_deleted,
		}
		for r in rows
	}


class _NoRedirect(urllib.request.HTTPRedirectHandler):
	# A URL that passes _is_public_http_url can still 30x to an internal
	# address — urllib follows redirects by default with no re-validation of
	# the new target, which would silently undo the check below. Refusing to
	# follow at all (rather than re-validating each hop) keeps this simple;
	# redirect_request() returning None makes urlopen raise HTTPError, which
	# _unfurl's caller already treats as "no preview available".
	def redirect_request(self, *args, **kwargs):
		return None


def _is_public_http_url(url):
	"""Rejects anything that isn't a plain http(s) URL resolving to an
	ordinary public address — the guard against using link previews to make
	this server fetch internal/cloud-metadata/loopback addresses. Checked
	against the actually-resolved IP (not just parsed from the string), so a
	hostname can't be used to talk around it. Doesn't defend against DNS
	rebinding (the name resolving differently a moment later, at connect
	time) — a determined attacker with control of a DNS record could still
	work around this; full protection needs connecting to a pinned IP
	directly, which urllib doesn't make straightforward."""
	try:
		parsed = urlparse(url)
	except ValueError:
		return False
	if parsed.scheme not in ("http", "https") or not parsed.hostname:
		return False

	# getaddrinfo has no timeout parameter of its own — a hostname whose DNS
	# server stalls or never responds would otherwise block this well past
	# the 3s budget _unfurl gives the actual fetch, tying up the request
	# worker. socket.setdefaulttimeout applies process-wide for the duration
	# of the call, so it's restored in finally regardless of outcome.
	previous_timeout = socket.getdefaulttimeout()
	try:
		socket.setdefaulttimeout(3)
		resolved = socket.getaddrinfo(parsed.hostname, None)
	except OSError:
		return False
	finally:
		socket.setdefaulttimeout(previous_timeout)

	for *_rest, sockaddr in resolved:
		ip = ipaddress.ip_address(sockaddr[0])
		if (
			ip.is_private
			or ip.is_loopback
			or ip.is_link_local
			or ip.is_reserved
			or ip.is_multicast
			or ip.is_unspecified
		):
			return False

	return True


def _unfurl(url):
	try:
		if not _is_public_http_url(url):
			return {"link_url": url, "link_title": url, "link_description": None, "link_image": None}

		opener = urllib.request.build_opener(_NoRedirect)
		req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
		with opener.open(req, timeout=3) as resp:
			html = resp.read(200000).decode("utf-8", errors="ignore")

		def meta(prop):
			m = re.search(
				rf'<meta[^>]+property=["\']og:{prop}["\'][^>]+content=["\']([^"\']+)["\']', html, re.I
			)
			if not m:
				m = re.search(
					rf'<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']og:{prop}["\']', html, re.I
				)
			return m.group(1) if m else None

		title = meta("title")
		if not title:
			m = re.search(r"<title[^>]*>([^<]+)</title>", html, re.I)
			title = m.group(1).strip() if m else url

		return {
			"link_url": url,
			"link_title": title,
			"link_description": meta("description"),
			"link_image": meta("image"),
		}
	except Exception:
		return {"link_url": url, "link_title": url, "link_description": None, "link_image": None}


def _post_card(post_id):
	post = frappe.db.get_value(
		"Post",
		post_id,
		["title", "post_type", "cover_image", "attachment", "author_name"],
		as_dict=True,
	)
	image = post.cover_image or (post.attachment if post.post_type != "Video" else None)
	return {
		"shared_post": post_id,
		"link_url": f"/posts/{post_id}",
		"link_title": post.title,
		"link_description": f"by {post.author_name}" if post.author_name else None,
		"link_image": image,
	}


def _poll_payload(poll_name):
	poll = frappe.db.get_value(
		"Poll", poll_name, ["question", "allow_multiple", "anonymous", "close_at"], as_dict=True
	)
	if not poll:
		return None

	options = frappe.db.get_all(
		"Poll Option", filters={"parent": poll_name}, fields=["name", "option_text"], order_by="idx asc"
	)
	votes = frappe.db.get_all("Poll Vote", filters={"poll": poll_name}, fields=["poll_option", "user"])

	counts = {}
	my_votes = set()
	for v in votes:
		counts[v.poll_option] = counts.get(v.poll_option, 0) + 1
		if v.user == frappe.session.user:
			my_votes.add(v.poll_option)

	for o in options:
		o.vote_count = counts.get(o.name, 0)
		o.voted_by_me = o.name in my_votes

	is_closed = bool(poll.close_at and now_datetime() > frappe.utils.get_datetime(poll.close_at))

	return {
		"name": poll_name,
		"question": poll.question,
		"allow_multiple": poll.allow_multiple,
		"anonymous": poll.anonymous,
		"close_at": poll.close_at,
		"is_closed": is_closed,
		"total_votes": len(votes),
		"options": options,
	}


@frappe.whitelist()
def create_poll(
	conversation: str,
	question: str,
	options: list | str,
	allow_multiple: int = 0,
	anonymous: int = 0,
	close_at: str | None = None,
):
	_require_member(conversation)
	if isinstance(options, str):
		options = frappe.parse_json(options)
	options = [o.strip() for o in (options or []) if o and o.strip()]

	if not question or not question.strip():
		frappe.throw(_("Poll question is required"))
	if len(options) < 2:
		frappe.throw(_("Add at least 2 options"))

	others = _other_members(conversation)
	if len(others) == 1 and _is_blocked(frappe.session.user, others[0]):
		frappe.throw(_("You can't message this user"))

	frappe.db.set_value(
		"Conversation Member",
		{"conversation": conversation, "user": frappe.session.user, "status": "Pending"},
		"status",
		"Accepted",
	)

	poll = frappe.get_doc(
		{
			"doctype": "Poll",
			"question": question.strip(),
			"allow_multiple": 1 if int(allow_multiple or 0) else 0,
			"anonymous": 1 if int(anonymous or 0) else 0,
			"close_at": close_at or None,
			"options": [{"option_text": text} for text in options],
		}
	)
	poll.insert(ignore_permissions=True)

	doc = frappe.get_doc({"doctype": "Message", "conversation": conversation, "poll": poll.name})
	doc.insert(ignore_permissions=True)

	payload = doc.as_dict()
	payload["reactions"] = []
	payload["attachments"] = []
	payload["poll_data"] = _poll_payload(poll.name)
	for other in others:
		frappe.publish_realtime("chat:new_message", payload, user=other, after_commit=True)

	return payload


@frappe.whitelist()
def toggle_poll_vote(option: str):
	# "parent" here is the option's owning Poll, now that Poll Option is a
	# child table - the field used to be called "poll" back when it was a
	# standalone doctype with its own explicit Link back to Poll.
	poll_option = frappe.db.get_value("Poll Option", option, ["parent"], as_dict=True)
	if not poll_option:
		frappe.throw(_("Option not found"), frappe.DoesNotExistError)

	poll = frappe.db.get_value("Poll", poll_option.parent, ["allow_multiple", "close_at"], as_dict=True)
	message = frappe.db.get_value(
		"Message", {"poll": poll_option.parent}, ["name", "conversation"], as_dict=True
	)
	if not message:
		frappe.throw(_("Not permitted"), frappe.PermissionError)
	_require_member(message.conversation)

	if poll.close_at and now_datetime() > frappe.utils.get_datetime(poll.close_at):
		frappe.throw(_("This poll is closed"))

	user = frappe.session.user
	existing = frappe.db.exists("Poll Vote", {"poll_option": option, "user": user})
	if existing:
		frappe.delete_doc("Poll Vote", existing, ignore_permissions=True)
	else:
		if not poll.allow_multiple:
			for other_vote in frappe.db.get_all(
				"Poll Vote", filters={"poll": poll_option.parent, "user": user}, pluck="name"
			):
				frappe.delete_doc("Poll Vote", other_vote, ignore_permissions=True)
		vote = frappe.get_doc({"doctype": "Poll Vote", "poll": poll_option.parent, "poll_option": option})
		vote.insert(ignore_permissions=True)

	result = _poll_payload(poll_option.parent)
	for other in _other_members(message.conversation):
		frappe.publish_realtime(
			"chat:poll_update", {"message": message.name, "poll_data": result}, user=other, after_commit=True
		)
	return result


def _list_conversations(status_filter):
	user = frappe.session.user
	memberships = frappe.db.get_all(
		"Conversation Member",
		filters={"user": user, "status": status_filter},
		fields=["conversation", "muted", "last_read"],
	)
	if not memberships:
		return []

	# Previously one round of Conversation / Conversation Member / User /
	# last-Message lookups *per conversation* (a user with 20 conversations
	# meant ~80 extra queries just to render the list) — batched into one
	# query per kind instead, each grouped/dict-keyed below so the loop that
	# builds `result` does no DB work of its own beyond the per-conversation
	# unread count (kept as a plain, cheap indexed `count()` rather than
	# batched too, since a fully-batched version would need to fetch every
	# unread message row up front to apply each conversation's own
	# last-read cutoff in Python — fine normally, but unbounded for a new
	# member of a long-lived, never-opened conversation).
	conv_ids = [m.conversation for m in memberships]

	conversations = {
		c.name: c
		for c in frappe.db.get_all(
			"Conversation", filters={"name": ["in", conv_ids]}, fields=["name", "is_group", "title"]
		)
	}

	members_by_conv = {}
	for row in frappe.db.get_all(
		"Conversation Member", filters={"conversation": ["in", conv_ids]}, fields=["conversation", "user"]
	):
		members_by_conv.setdefault(row.conversation, []).append(row.user)

	other_user_ids = list(
		{
			u
			for conv_id in conv_ids
			if not (conversations.get(conv_id) and conversations[conv_id].is_group)
			for u in members_by_conv.get(conv_id, [])
			if u != user
		}
	)
	users_by_id = {
		u.name: u
		for u in frappe.db.get_all(
			"User", filters={"name": ["in", other_user_ids]}, fields=["name", "full_name", "user_image"]
		)
	}

	last_message_by_conv = {}
	placeholders = ", ".join(["%s"] * len(conv_ids))
	# nosemgrep: frappe-sql-format-injection (only the %s placeholders are formatted in; every value is a parameter)
	for row in frappe.db.sql(
		f"""
		SELECT m.conversation, m.content, m.creation, m.sender, m.is_deleted,
			m.shared_post, m.poll,
			EXISTS(SELECT 1 FROM `tabMessage Attachment` ma WHERE ma.parent = m.name) AS has_attachment
		FROM `tabMessage` m
		INNER JOIN (
			SELECT conversation, MAX(creation) AS max_creation
			FROM `tabMessage`
			WHERE conversation IN ({placeholders})
			GROUP BY conversation
		) latest ON m.conversation = latest.conversation AND m.creation = latest.max_creation
		""",
		conv_ids,
		as_dict=True,
	):
		# A conversation could in principle have two messages sharing the
		# exact same creation timestamp — first one wins, any is fine here.
		last_message_by_conv.setdefault(row.conversation, row)

	result = []
	for m in memberships:
		conv = conversations.get(m.conversation)
		if not conv:
			continue
		others = [u for u in members_by_conv.get(m.conversation, []) if u != user]

		if conv.is_group:
			display_name = conv.title or "Group"
			display_image = None
			other_user = None
		else:
			other = users_by_id.get(others[0]) if others else None
			if other:
				other_user, display_name, display_image = other.name, other.full_name, other.user_image
			else:
				# Same "dangling member id" case _dm_display_info handles -
				# either there was never another member, or their User was
				# deleted directly and this Conversation Member row was
				# never cleaned up.
				other_user, display_name, display_image = None, "Deleted user", None

		last_message = last_message_by_conv.get(m.conversation)
		unread_count = frappe.db.count(
			"Message",
			{
				"conversation": m.conversation,
				"sender": ["!=", user],
				"creation": [">", m.last_read or "1900-01-01"],
			},
		)

		result.append(
			{
				"conversation": m.conversation,
				"display_name": display_name,
				"display_image": display_image,
				"other_user": other_user,
				"is_group": conv.is_group,
				"muted": m.muted,
				"last_message": _conversation_list_preview(last_message),
				"last_message_at": last_message.creation if last_message else None,
				"unread_count": 0 if m.muted else unread_count,
			}
		)

	# last_message_at is a real datetime for conversations that have a
	# message, or None for one that doesn't yet (a freshly created group,
	# most commonly) — sort keys need to be one consistent type, so stringify
	# rather than mixing datetime and "" (which Python 3 refuses to compare).
	result.sort(key=lambda r: str(r["last_message_at"] or ""), reverse=True)
	return result


@frappe.whitelist()
def list_conversations():
	return _list_conversations(["not in", ["Pending", "Declined"]])


@frappe.whitelist()
def list_message_requests():
	return _list_conversations("Pending")


@frappe.whitelist()
def respond_to_message_request(conversation: str, accept: int):
	_require_member(conversation)
	status = "Accepted" if int(accept) else "Declined"
	frappe.db.set_value(
		"Conversation Member", {"conversation": conversation, "user": frappe.session.user}, "status", status
	)
	return {"status": status}


@frappe.whitelist()
def unread_message_count():
	user = frappe.session.user
	memberships = frappe.db.get_all(
		"Conversation Member",
		filters={"user": user, "muted": 0, "status": ["not in", ["Pending", "Declined"]]},
		fields=["conversation", "last_read"],
	)
	if not memberships:
		return 0

	# One query per conversation (a `count()` each) previously meant one DB
	# round-trip per conversation, on a call that fires on every app-shell
	# mount *and* every realtime chat:new_message event for every connected
	# user - the single highest-frequency call in this file. Each count stays
	# a plain, cheap indexed COUNT (unlike list_conversations' unread count,
	# this never fetches full rows), just combined into one round-trip via a
	# single UNION ALL query instead of N separate ones.
	subqueries = []
	params = []
	for m in memberships:
		subqueries.append(
			"SELECT COUNT(*) AS cnt FROM `tabMessage` WHERE conversation = %s AND sender != %s AND creation > %s"
		)
		params.extend([m.conversation, user, m.last_read or "1900-01-01"])

	rows = frappe.db.sql(" UNION ALL ".join(subqueries), params, as_dict=True)
	return sum(r.cnt for r in rows)


@frappe.whitelist()
def start_dm(other_user: str):
	user = frappe.session.user
	if other_user == user:
		frappe.throw(_("You can't message yourself"))
	if _is_blocked(user, other_user):
		frappe.throw(_("You can't message this user"))

	my_convs = frappe.db.get_all("Conversation Member", filters={"user": user}, fields=["conversation"])
	for c in my_convs:
		conv = frappe.db.get_value("Conversation", c.conversation, ["is_group"], as_dict=True)
		if conv and not conv.is_group:
			others = _other_members(c.conversation, exclude=user)
			if others == [other_user]:
				return {"conversation": c.conversation}

	conv = frappe.get_doc({"doctype": "Conversation", "is_group": 0})
	conv.insert(ignore_permissions=True)

	# The recipient's own row is what starts Pending, never the sender's -
	# they already know they're messaging someone, there's nothing for them
	# to accept. Every start_dm call is by definition the FIRST message
	# between these two (the loop above returns early for an existing
	# conversation), so the recipient always gets a request to accept or
	# decline before the conversation opens for real.
	sender = frappe.get_doc({"doctype": "Conversation Member", "conversation": conv.name, "user": user})
	sender.insert(ignore_permissions=True)
	recipient = frappe.get_doc(
		{
			"doctype": "Conversation Member",
			"conversation": conv.name,
			"user": other_user,
			"status": "Pending",
		}
	)
	recipient.insert(ignore_permissions=True)

	return {"conversation": conv.name}


@frappe.whitelist()
def get_conversation(conversation: str):
	_require_member(conversation)
	conv = frappe.db.get_value("Conversation", conversation, ["is_group", "title"], as_dict=True)
	others = _other_members(conversation)
	my_membership = frappe.db.get_value(
		"Conversation Member",
		{"conversation": conversation, "user": frappe.session.user},
		["muted", "status"],
		as_dict=True,
	)

	if conv.is_group:
		display_name = conv.title or "Group"
		display_image = None
		other_user = None
	else:
		other_user, display_name, display_image = _dm_display_info(others[0] if others else None)

	other_user_username = frappe.db.get_value("User", other_user, "username") if other_user else None
	other_last_read = None
	if other_user:
		other_last_read = frappe.db.get_value(
			"Conversation Member", {"conversation": conversation, "user": other_user}, "last_read"
		)

	return {
		"conversation": conversation,
		"is_group": conv.is_group,
		"display_name": display_name,
		"display_image": display_image,
		"other_user": other_user,
		"other_user_username": other_user_username,
		"is_blocked": _is_blocked(frappe.session.user, other_user) if other_user else False,
		"i_blocked_them": bool(
			other_user
			and frappe.db.exists("Blocked User", {"blocker": frappe.session.user, "blocked": other_user})
		),
		"muted": my_membership.muted if my_membership else False,
		"my_status": my_membership.status if my_membership else "Accepted",
		"other_last_read": other_last_read,
	}


def _invite_to_group(conversation, user):
	"""Adding someone to a group is a request, not immediate membership —
	skip silently if they're already in, or already have a pending invite,
	rather than erroring on what's really a no-op from the caller's POV."""
	if frappe.db.exists("Conversation Member", {"conversation": conversation, "user": user}):
		return
	if frappe.db.exists(
		"Group Invite", {"conversation": conversation, "invited_user": user, "status": "Pending"}
	):
		return
	invite = frappe.get_doc({"doctype": "Group Invite", "conversation": conversation, "invited_user": user})
	invite.insert(ignore_permissions=True)
	title = frappe.db.get_value("Conversation", conversation, "title") or "a group"
	_notify(
		recipient=user,
		actor=frappe.session.user,
		notif_type="Group Invite",
		message=f'invited you to join "{title}"',
		reference_doctype="Group Invite",
		reference_name=invite.name,
	)


@frappe.whitelist()
def create_group(title: str, members: list | str):
	if isinstance(members, str):
		members = frappe.parse_json(members)
	# Dedupe while preserving order, and never invite yourself — you're added
	# as the (first, admin) member below regardless.
	members = list(dict.fromkeys(m for m in (members or []) if m and m != frappe.session.user))

	title = (title or "").strip()
	if not title:
		frappe.throw(_("Give the group a name"))
	if not members:
		frappe.throw(_("Add at least one person to invite"))

	conv = frappe.get_doc({"doctype": "Conversation", "is_group": 1, "title": title})
	conv.insert(ignore_permissions=True)

	creator = frappe.get_doc(
		{
			"doctype": "Conversation Member",
			"conversation": conv.name,
			"user": frappe.session.user,
			"is_admin": 1,
		}
	)
	creator.insert(ignore_permissions=True)

	for user in members:
		_invite_to_group(conv.name, user)

	return {"conversation": conv.name}


@frappe.whitelist()
def invite_to_group(conversation: str, user: str):
	_require_admin(conversation)
	if user == frappe.session.user:
		frappe.throw(_("You're already in this group"))
	_invite_to_group(conversation, user)
	return "success"


@frappe.whitelist()
def cancel_group_invite(name: str):
	invite = frappe.get_doc("Group Invite", name)
	_require_admin(invite.conversation)
	frappe.delete_doc("Group Invite", name, ignore_permissions=True)
	return "success"


@frappe.whitelist()
def respond_to_group_invite(name: str, accept: int):
	invite = frappe.get_doc("Group Invite", name)
	if invite.invited_user != frappe.session.user:
		frappe.throw(_("Not permitted"), frappe.PermissionError)
	if invite.status != "Pending":
		return {"status": invite.status}

	accept = int(accept)
	invite.status = "Accepted" if accept else "Declined"
	invite.flags.ignore_permissions = True
	invite.save()

	if accept:
		if not frappe.db.exists(
			"Conversation Member", {"conversation": invite.conversation, "user": frappe.session.user}
		):
			member = frappe.get_doc(
				{
					"doctype": "Conversation Member",
					"conversation": invite.conversation,
					"user": frappe.session.user,
				}
			)
			member.insert(ignore_permissions=True)
		title = frappe.db.get_value("Conversation", invite.conversation, "title") or "the group"
		_notify(
			recipient=invite.invited_by,
			actor=frappe.session.user,
			notif_type="Group Invite",
			message=f'joined "{title}"',
			reference_doctype="Conversation",
			reference_name=invite.conversation,
		)

	return {"status": invite.status, "conversation": invite.conversation if accept else None}


@frappe.whitelist()
def list_group_members(conversation: str):
	_require_member(conversation)
	members = frappe.db.get_all(
		"Conversation Member",
		filters={"conversation": conversation},
		fields=["name", "user", "is_admin", "creation"],
		order_by="creation asc",
	)
	for m in members:
		m.full_name = frappe.db.get_value("User", m.user, "full_name")
		m.user_image = frappe.db.get_value("User", m.user, "user_image")

	pending_invites = frappe.db.get_all(
		"Group Invite",
		filters={"conversation": conversation, "status": "Pending"},
		fields=["name", "invited_user", "creation"],
		order_by="creation desc",
	)
	for p in pending_invites:
		p.full_name = frappe.db.get_value("User", p.invited_user, "full_name")
		p.user_image = frappe.db.get_value("User", p.invited_user, "user_image")

	return {
		"members": members,
		"pending_invites": pending_invites,
		"my_is_admin": _is_admin(conversation),
	}


@frappe.whitelist()
def remove_group_member(conversation: str, user: str):
	_require_admin(conversation)
	if user == frappe.session.user:
		frappe.throw(_('Use "Leave group" to remove yourself'))
	name = frappe.db.get_value("Conversation Member", {"conversation": conversation, "user": user})
	if not name:
		frappe.throw(_("That person isn't in this group"))
	frappe.delete_doc("Conversation Member", name, ignore_permissions=True)
	return "success"


@frappe.whitelist()
def set_group_admin(conversation: str, user: str, is_admin: int):
	_require_admin(conversation)
	is_admin = int(is_admin)
	if not is_admin:
		admin_count = frappe.db.count("Conversation Member", {"conversation": conversation, "is_admin": 1})
		if admin_count <= 1:
			frappe.throw(_("A group needs at least one admin"))
	name = frappe.db.get_value("Conversation Member", {"conversation": conversation, "user": user})
	if not name:
		frappe.throw(_("That person isn't in this group"))
	frappe.db.set_value("Conversation Member", name, "is_admin", is_admin)
	return "success"


@frappe.whitelist()
def rename_group(conversation: str, title: str):
	_require_admin(conversation)
	title = (title or "").strip()
	if not title:
		frappe.throw(_("Give the group a name"))
	frappe.db.set_value("Conversation", conversation, "title", title)
	return "success"


@frappe.whitelist()
def leave_group(conversation: str):
	_require_member(conversation)
	name = frappe.db.get_value(
		"Conversation Member", {"conversation": conversation, "user": frappe.session.user}
	)
	was_admin = _is_admin(conversation)
	frappe.delete_doc("Conversation Member", name, ignore_permissions=True)

	remaining = frappe.db.get_all(
		"Conversation Member",
		filters={"conversation": conversation},
		fields=["name", "is_admin"],
		order_by="creation asc",
	)
	if not remaining:
		# No one left — nothing more to leave, so clean up rather than leave a
		# dangling empty group around forever.
		frappe.delete_doc("Conversation", conversation, ignore_permissions=True, force=True)
	elif was_admin and not any(r.is_admin for r in remaining):
		# Never leave a group with zero admins — hand it to whoever's been in
		# it longest.
		frappe.db.set_value("Conversation Member", remaining[0].name, "is_admin", 1)

	return "success"


@frappe.whitelist()
def list_mentionable_users(conversation: str):
	"""Mention candidates for this conversation's composer — anyone on the
	platform, not just this conversation's members. `conversation` just
	confirms the caller is actually part of an active chat before handing
	back the list."""
	_require_member(conversation)
	return frappe.db.get_all(
		"User",
		filters={
			"enabled": 1,
			"user_type": "Website User",
			"name": ["not in", [frappe.session.user, "Guest"]],
		},
		fields=["name", "username", "full_name", "user_image"],
		order_by="full_name asc",
		limit_page_length=200,
	)


def _attachment_url(file_url):
	# Attachments are private files linked to the Message they were shared
	# in (see send_message) — but Frappe's own /private/files/ route can't
	# serve them to anyone but the uploader: its permission check for
	# *listing* files (a stricter, earlier gate than has_permission) hard-
	# restricts any account without the System User role to files it
	# personally owns, with no way to delegate through attached_to_doctype —
	# and every real account here is a Website User, deliberately, since
	# granting System User would also hand out desk/backend access. Routing
	# through download_attachment (which checks conversation membership
	# itself, bypassing that route entirely) is what actually lets other
	# participants see images shared with them.
	if not file_url:
		return file_url
	return f"/api/method/cafe.chat.download_attachment?file_url={quote(file_url, safe='')}"


def _attachments_by_message(names):
	rows = frappe.db.get_all(
		"Message Attachment",
		filters={"parent": ["in", names]},
		fields=["parent", "file_url", "file_name", "file_size"],
		order_by="idx asc",
	)
	grouped = {}
	for r in rows:
		grouped.setdefault(r.parent, []).append(
			{"file_url": _attachment_url(r.file_url), "file_name": r.file_name, "file_size": r.file_size}
		)
	return grouped


@frappe.whitelist()
def download_attachment(file_url: str):
	file_name = frappe.db.get_value("File", {"file_url": file_url})
	if not file_name:
		raise frappe.DoesNotExistError
	file_doc = frappe.get_doc("File", file_name)

	if file_doc.attached_to_doctype == "Message" and file_doc.attached_to_name:
		if frappe.db.get_value("Message", file_doc.attached_to_name, "is_deleted"):
			# get_messages() already stops sending this URL out once the
			# message is deleted - this covers whoever already has it
			# (an open tab, a cached page) from still being able to fetch it.
			raise frappe.DoesNotExistError

	allowed = not file_doc.is_private or file_doc.owner == frappe.session.user
	if not allowed and file_doc.attached_to_doctype == "Message" and file_doc.attached_to_name:
		conversation = frappe.db.get_value("Message", file_doc.attached_to_name, "conversation")
		allowed = bool(conversation and _is_member(conversation))
	# Matches the one other way File.has_permission (which this function
	# otherwise stands in for — see _attachment_url) can grant access: an
	# explicit frappe.share.add_docshare("File", ...) on this exact file.
	# Nothing in this app creates one today, but honoring it costs nothing
	# and avoids silently ignoring Frappe's own native sharing feature.
	if not allowed:
		allowed = bool(
			frappe.share.get_shared(
				"File",
				filters=[["share_name", "=", file_doc.name]],
				rights=["read"],
				user=frappe.session.user,
			)
		)
	if not allowed:
		raise frappe.PermissionError

	frappe.local.response.filename = file_doc.file_name
	frappe.local.response.filecontent = file_doc.get_content()
	frappe.local.response.type = "download"
	# Content-Disposition defaults to "attachment" (a real download) unless
	# told otherwise — needed as "inline" for the chat image-preview grid's
	# <img src>, but only for an allowlist of genuinely-raster image types.
	# Chat attachments accept any file type (no upload restriction), and
	# Frappe's as_raw() — what this response type renders through — doesn't
	# apply its own FORCE_DOWNLOAD_EXTENSIONS safeguard the way the normal
	# private-file route does. Without this check, a malicious .svg/.html
	# "image" sent in a chat would render same-origin (not download) the
	# moment its recipient opens the link, running any embedded <script>
	# with their session — a stored-XSS attachment. Anything not on this
	# list downloads instead, exactly like clicking a plain file attachment.
	if mimetypes.guess_type(file_doc.file_name)[0] in (
		"image/jpeg",
		"image/png",
		"image/gif",
		"image/webp",
		"image/bmp",
	):
		frappe.local.response["display_content_as"] = "inline"


@frappe.whitelist()
def get_messages(conversation: str, start: int = 0, limit: int = 50):
	_require_member(conversation)
	rows = frappe.db.get_all(
		"Message",
		filters={"conversation": conversation},
		fields=[
			"name",
			"sender",
			"sender_name",
			"sender_image",
			"content",
			"reply_to",
			"is_edited",
			"is_deleted",
			"attachment",
			"shared_post",
			"poll",
			"link_url",
			"link_title",
			"link_description",
			"link_image",
			"creation",
		],
		order_by="creation desc",
		start=int(start),
		page_length=int(limit),
	)
	rows.reverse()

	# Deleted messages never had their attachments looked up here - nothing
	# left to show once content is scrubbed below, and no point paying for
	# the query.
	live_names = [r.name for r in rows if not r.is_deleted]
	grouped = _attachments_by_message(live_names)
	reactions_by_message = _reactions_by_message(live_names)
	reply_previews = _reply_previews_by_ids([r.reply_to for r in rows if r.reply_to])
	for row in rows:
		row.reply_to_preview = reply_previews.get(row.reply_to) if row.reply_to else None
		if row.is_deleted:
			# Row stays in history (so reply_to references elsewhere still
			# resolve, and the thread doesn't visibly jump) but nothing of
			# its actual content is ever sent back out again.
			row.content = None
			row.attachment = None
			row.attachments = []
			row.shared_post = None
			row.poll = None
			row.poll_data = None
			row.link_url = None
			row.link_title = None
			row.link_description = None
			row.link_image = None
			row.reactions = []
			continue
		row.reactions = reactions_by_message.get(row.name, [])
		# Older messages only have the single legacy `attachment` field;
		# surface it the same way so the frontend only ever deals with a list.
		row.attachments = grouped.get(row.name) or (
			[
				{
					"file_url": _attachment_url(row.attachment),
					"file_name": row.attachment.rsplit("/", 1)[-1],
					"file_size": None,
				}
			]
			if row.attachment
			else []
		)
		row.poll_data = _poll_payload(row.poll) if row.poll else None
	return rows


@frappe.whitelist()
def send_message(
	conversation: str,
	content: str | None = None,
	attachments: list | str | None = None,
	shared_post: str | None = None,
	reply_to: str | None = None,
):
	_require_member(conversation)
	if isinstance(attachments, str):
		attachments = frappe.parse_json(attachments)
	attachments = attachments or []

	if not content and not attachments and not shared_post:
		frappe.throw(_("Message cannot be empty"))

	others = _other_members(conversation)
	if len(others) == 1 and _is_blocked(frappe.session.user, others[0]):
		frappe.throw(_("You can't message this user"))

	# Replying to a still-pending message request is itself an acceptance -
	# same as tapping "Accept" explicitly (respond_to_message_request), just
	# implicit. Only ever touches the sender's own row.
	frappe.db.set_value(
		"Conversation Member",
		{"conversation": conversation, "user": frappe.session.user, "status": "Pending"},
		"status",
		"Accepted",
	)

	if reply_to:
		# Reply previews expose sender_name/content straight off the target
		# row with no membership check of its own (see _reply_preview) - this
		# is what actually enforces that a client can't set reply_to to some
		# other conversation's message and use the preview to peek at it.
		reply_conversation = frappe.db.get_value("Message", reply_to, "conversation")
		if reply_conversation != conversation:
			frappe.throw(_("Invalid reply"), frappe.PermissionError)

	doc = frappe.get_doc(
		{"doctype": "Message", "conversation": conversation, "content": content, "reply_to": reply_to}
	)
	for a in attachments:
		doc.append(
			"attachments",
			{"file_url": a.get("file_url"), "file_name": a.get("file_name"), "file_size": a.get("file_size")},
		)

	if shared_post:
		_check_post_visible(shared_post)
		doc.update(_post_card(shared_post))
	elif content:
		match = URL_RE.search(content)
		if match:
			doc.update(_unfurl(match.group(1)))

	doc.insert(ignore_permissions=True)

	# Attachments upload as private files (FileUploader's own default) with
	# no doctype/docname set — linking each one to this Message is what lets
	# download_attachment (below) work out which conversation it belongs to
	# and check membership. Scoped to files this sender owns, so a message
	# can't be used to hijack access to someone else's unrelated private
	# file by name.
	for a in attachments:
		file_url = a.get("file_url")
		if not file_url:
			continue
		file_name = frappe.db.get_value("File", {"file_url": file_url, "owner": frappe.session.user}, "name")
		if file_name:
			frappe.db.set_value(
				"File",
				file_name,
				{"attached_to_doctype": "Message", "attached_to_name": doc.name},
				update_modified=False,
			)

	payload = doc.as_dict()
	payload["reactions"] = []
	payload["reply_to_preview"] = _reply_preview(reply_to)
	for a in payload.get("attachments") or []:
		a["file_url"] = _attachment_url(a.get("file_url"))
	for other in others:
		frappe.publish_realtime("chat:new_message", payload, user=other, after_commit=True)

	# @mentions in the composer can autocomplete to anyone (see
	# list_mentionable_users), including people not in this conversation —
	# but only notify ones who actually are: someone outside the chat has no
	# way to open it, so a notification for a mention they can't see or act
	# on is just confusing noise, not something worth alerting them to.
	raw_mentions = _extract_mentions(content)
	# "all" isn't a real user id (the composer only offers it as a candidate
	# for group conversations - see list_mentionable_users' frontend caller),
	# so it can never survive the usual `& set(others)` intersection below.
	# Expand it to every other member instead of just dropping it.
	mentioned_all = "all" in raw_mentions and bool(
		frappe.db.get_value("Conversation", conversation, "is_group")
	)
	mentioned_ids = set(others) if mentioned_all else set(raw_mentions) & set(others)
	if mentioned_ids:
		valid_mentions = frappe.db.get_all(
			"User", filters={"name": ["in", list(mentioned_ids)], "enabled": 1}, pluck="name"
		)
		notif_message = "mentioned everyone in the group" if mentioned_all else "mentioned you in a message"
		for user in valid_mentions:
			_notify(
				recipient=user,
				actor=frappe.session.user,
				notif_type="Mention",
				message=notif_message,
				reference_doctype="Conversation",
				reference_name=conversation,
			)

	return payload


@frappe.whitelist()
def forward_message(message: str, conversation: str):
	source = frappe.get_doc("Message", message)
	if source.is_deleted:
		frappe.throw(_("This message has been deleted"))
	# Proves the forwarder actually had legitimate access to this message
	# (and therefore to whatever it's attaching) - what makes it safe for
	# the re-link below to bypass send_message's normal owner-only check.
	_require_member(source.conversation)

	attachments = [
		{"file_url": a.file_url, "file_name": a.file_name, "file_size": a.file_size}
		for a in source.attachments
	]
	result = send_message(
		conversation=conversation,
		content=source.content,
		attachments=attachments,
		shared_post=source.shared_post,
	)

	# send_message only re-links a File it can see is owned by the caller -
	# correct for its usual "attach whatever I just uploaded" callers, but a
	# forwarded attachment normally belongs to whoever sent the original
	# message. The membership check above is what makes re-linking it here
	# safe regardless of that original owner.
	for a in attachments:
		file_name = frappe.db.get_value(
			"File",
			{"file_url": a["file_url"], "attached_to_doctype": "Message", "attached_to_name": source.name},
			"name",
		)
		if file_name:
			frappe.db.set_value(
				"File",
				file_name,
				{"attached_to_doctype": "Message", "attached_to_name": result["name"]},
				update_modified=False,
			)

	return result


@frappe.whitelist()
def edit_message(message: str, content: str):
	doc = frappe.get_doc("Message", message)
	if doc.sender != frappe.session.user:
		frappe.throw(_("You can only edit your own messages"), frappe.PermissionError)
	if doc.is_deleted:
		frappe.throw(_("Can't edit a deleted message"))
	if not content or not content.strip():
		frappe.throw(_("Message cannot be empty"))

	# Deliberately narrow: only the text changes. Editing doesn't re-run link
	# unfurling or re-notify newly-added @mentions - those are first-send
	# behaviors, not something a quiet text fix should retrigger.
	doc.content = content
	doc.is_edited = 1
	doc.save(ignore_permissions=True)

	for other in _other_members(doc.conversation):
		frappe.publish_realtime(
			"chat:message_edited",
			{"message": doc.name, "content": doc.content, "is_edited": 1},
			user=other,
			after_commit=True,
		)
	return {"content": doc.content, "is_edited": 1}


@frappe.whitelist()
def delete_message(message: str):
	doc = frappe.get_doc("Message", message)
	if doc.sender != frappe.session.user:
		frappe.throw(_("You can only delete your own messages"), frappe.PermissionError)
	if doc.is_deleted:
		return "success"

	# Soft delete: the row (and its name) stays put so any reply_to pointing
	# at it still resolves - _reply_preview and get_messages both already
	# know to show "deleted" instead of real content wherever this id
	# appears, rather than a dangling reference or a hole in the thread.
	doc.is_deleted = 1
	doc.save(ignore_permissions=True)

	for other in _other_members(doc.conversation):
		frappe.publish_realtime("chat:message_deleted", {"message": doc.name}, user=other, after_commit=True)
	return "success"


@frappe.whitelist()
def mark_read(conversation: str):
	_require_member(conversation)
	name = frappe.db.get_value(
		"Conversation Member", {"conversation": conversation, "user": frappe.session.user}
	)
	frappe.db.set_value("Conversation Member", name, "last_read", now_datetime())
	for other in _other_members(conversation):
		frappe.publish_realtime(
			"chat:read",
			{"conversation": conversation, "user": frappe.session.user},
			user=other,
			after_commit=True,
		)
	return "success"


@frappe.whitelist()
def set_typing(conversation: str):
	_require_member(conversation)
	for other in _other_members(conversation):
		frappe.publish_realtime(
			"chat:typing", {"conversation": conversation, "user": frappe.session.user}, user=other
		)
	return "success"


@frappe.whitelist()
def toggle_reaction(message: str, emoji: str):
	msg = frappe.db.get_value("Message", message, ["conversation"], as_dict=True)
	if not msg:
		frappe.throw(_("Message not found"))
	_require_member(msg.conversation)

	existing = frappe.db.exists(
		"Message Reaction", {"message": message, "user": frappe.session.user, "emoji": emoji}
	)
	if existing:
		frappe.delete_doc("Message Reaction", existing, ignore_permissions=True)
	else:
		reaction = frappe.get_doc({"doctype": "Message Reaction", "message": message, "emoji": emoji})
		reaction.insert(ignore_permissions=True)

	result = _group_reactions(message)
	for other in _other_members(msg.conversation):
		frappe.publish_realtime(
			"chat:reaction", {"message": message, "reactions": result}, user=other, after_commit=True
		)
	return result


@frappe.whitelist()
def mute_conversation(conversation: str, muted: int):
	_require_member(conversation)
	name = frappe.db.get_value(
		"Conversation Member", {"conversation": conversation, "user": frappe.session.user}
	)
	frappe.db.set_value("Conversation Member", name, "muted", int(muted))
	return "success"


@frappe.whitelist()
def block_user(user: str):
	if not frappe.db.exists("Blocked User", {"blocker": frappe.session.user, "blocked": user}):
		doc = frappe.get_doc({"doctype": "Blocked User", "blocked": user})
		doc.insert(ignore_permissions=True)
	return "success"


@frappe.whitelist()
def unblock_user(user: str):
	frappe.db.delete("Blocked User", {"blocker": frappe.session.user, "blocked": user})
	frappe.db.commit()  # nosemgrep: frappe-manual-commit (saved at once; the chat reloads the block state right after)
	return "success"


@frappe.whitelist()
def list_blocked_users():
	rows = frappe.db.get_all(
		"Blocked User", filters={"blocker": frappe.session.user}, fields=["name", "blocked"]
	)
	if not rows:
		return rows

	users_by_id = {
		u.name: u
		for u in frappe.db.get_all(
			"User",
			filters={"name": ["in", [r.blocked for r in rows]]},
			fields=["name", "full_name", "user_image"],
		)
	}
	for r in rows:
		u = users_by_id.get(r.blocked)
		r.full_name = u.full_name if u else None
		r.user_image = u.user_image if u else None
	return rows


@frappe.whitelist()
def search_people_to_message(query: str | None = None):
	filters = {"enabled": 1, "user_type": "Website User", "name": ["not in", [frappe.session.user, "Guest"]]}
	if query:
		filters["full_name"] = ["like", f"%{query}%"]

	people = frappe.db.get_all(
		"User",
		filters=filters,
		fields=["name", "full_name", "user_image", "username"],
		order_by="full_name asc",
		limit_page_length=20,
	)
	blocked_by_me = {
		b.blocked
		for b in frappe.db.get_all(
			"Blocked User", filters={"blocker": frappe.session.user}, fields=["blocked"]
		)
	}
	blocked_me = {
		b.blocker
		for b in frappe.db.get_all(
			"Blocked User", filters={"blocked": frappe.session.user}, fields=["blocker"]
		)
	}
	excluded = blocked_by_me | blocked_me
	return [p for p in people if p.name not in excluded]


@frappe.whitelist()
def search_messages(conversation: str, query: str):
	_require_member(conversation)
	rows = frappe.db.get_all(
		"Message",
		filters={"conversation": conversation, "content": ["like", f"%{query}%"]},
		fields=["name", "content", "sender_name", "creation"],
		order_by="creation desc",
		limit_page_length=50,
	)
	for row in rows:
		row.content = _preview_text(row.content)
	return rows
