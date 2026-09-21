"""
Data models for Hubble (cloud/multi-user version).

Design notes:
- Users are identified by a persistent browser cookie (device_id) — no
  email/password needed for a demo. Good enough to distinguish people;
  not meant to be secure auth.
- A Card holds arbitrary fields as JSON so we can add field types without
  schema migrations. Every field can be independently marked visible/hidden.
- "name" and "nickname" are first-class columns (not inside the JSON blob)
  because the app enforces a rule on them (at least one must be visible).
"""

import random
import string
import time
import uuid

from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()


def gen_id():
    return str(uuid.uuid4())


def gen_sync_code():
    return "".join(random.choices(string.ascii_uppercase + string.digits, k=6))


def gen_hub_serial():
    return "".join(random.choices(string.digits, k=4))


class User(db.Model):
    id = db.Column(db.String, primary_key=True, default=gen_id)
    device_id = db.Column(db.String, unique=True, nullable=False, index=True)
    sync_code = db.Column(db.String, unique=True, nullable=False, default=gen_sync_code, index=True)
    created_at = db.Column(db.Float, default=time.time)

    # Registration identity (Phase 5). Optional by design — a device gets an
    # anonymous User immediately (see before_request), and registering just
    # attaches a name/email/phone to it, or links the cookie to an existing
    # matching identity so the same person can log in from a new device.
    reg_name = db.Column(db.String, default="")
    email = db.Column(db.String, unique=True, nullable=True, index=True)
    phone = db.Column(db.String, unique=True, nullable=True, index=True)

    cards = db.relationship("Card", backref="user", lazy=True, cascade="all, delete-orphan")

    def is_registered(self):
        return bool(self.email or self.phone)


class Card(db.Model):
    id = db.Column(db.String, primary_key=True, default=gen_id)
    user_id = db.Column(db.String, db.ForeignKey("user.id"), nullable=False)

    card_type = db.Column(db.String, nullable=False)  # 'business' | 'social'
    is_active = db.Column(db.Boolean, default=False)  # only one active card per user at a time

    name = db.Column(db.String, default="")
    name_visible = db.Column(db.Boolean, default=True)
    nickname = db.Column(db.String, default="")
    nickname_visible = db.Column(db.Boolean, default=False)

    photo_url = db.Column(db.String, default="")  # data URL for the demo

    # Default communication openness (spec: replaces the hub-header
    # green/red toggle — a personal default carried into every hub, still
    # adjustable live per-hub via the dot next to one's own name).
    is_open_to_contact = db.Column(db.Boolean, default=True)

    # Business fields
    title = db.Column(db.String, default="")
    title_visible = db.Column(db.Boolean, default=True)
    company = db.Column(db.String, default="")
    company_visible = db.Column(db.Boolean, default=True)

    # Social / contact fields — each has its own visibility flag
    phone = db.Column(db.String, default="")
    phone_visible = db.Column(db.Boolean, default=False)
    email = db.Column(db.String, default="")
    email_visible = db.Column(db.Boolean, default=False)
    instagram = db.Column(db.String, default="")
    instagram_visible = db.Column(db.Boolean, default=False)
    tiktok = db.Column(db.String, default="")
    tiktok_visible = db.Column(db.Boolean, default=False)

    mood = db.Column(db.String, default="")
    mood_visible = db.Column(db.Boolean, default=True)
    status = db.Column(db.String, default="")
    status_visible = db.Column(db.Boolean, default=True)
    bio = db.Column(db.String, default="")
    bio_visible = db.Column(db.Boolean, default=True)

    created_at = db.Column(db.Float, default=time.time)

    photos = db.relationship("CardPhoto", backref="card", lazy=True, cascade="all, delete-orphan")

    def display_name(self):
        """Respects the visibility rule: show name if visible, else nickname, else 'Anonymous'."""
        if self.name_visible and self.name:
            return self.name
        if self.nickname_visible and self.nickname:
            return self.nickname
        return self.name or self.nickname or "Anonymous"

    def public_dict(self):
        """Only the fields this card's owner has marked visible. photo_url is
        specifically the one photo marked as the profile picture (shown next
        to the name everywhere); photos is the fuller gallery — allowed for
        others to browse only once they open the full profile."""
        visible_photos = [p.url for p in sorted(self.photos, key=lambda p: p.order) if p.is_visible]
        profile_photo = next((p.url for p in self.photos if p.is_profile_photo), None)
        out = {
            "id": self.id, "type": self.card_type,
            "photo_url": profile_photo or self.photo_url,
            "photos": visible_photos,
        }
        field_pairs = [
            ("name", "name_visible"), ("nickname", "nickname_visible"),
            ("title", "title_visible"), ("company", "company_visible"),
            ("phone", "phone_visible"), ("email", "email_visible"),
            ("instagram", "instagram_visible"), ("tiktok", "tiktok_visible"),
            ("mood", "mood_visible"), ("status", "status_visible"), ("bio", "bio_visible"),
        ]
        for field, vis_field in field_pairs:
            if getattr(self, vis_field):
                val = getattr(self, field)
                if val:
                    out[field] = val
        return out

    def full_dict(self):
        """Every field + its visibility flag, for editing in the owner's own UI."""
        field_pairs = [
            "name", "nickname", "title", "company", "phone", "email",
            "instagram", "tiktok", "mood", "status", "bio",
        ]
        profile_photo = next((p.url for p in self.photos if p.is_profile_photo), None)
        out = {
            "id": self.id, "type": self.card_type, "is_active": self.is_active,
            "photo_url": profile_photo or self.photo_url,
            "is_open_to_contact": self.is_open_to_contact,
            "photos": [
                {"id": p.id, "url": p.url, "is_visible": p.is_visible, "is_profile_photo": p.is_profile_photo}
                for p in sorted(self.photos, key=lambda p: p.order)
            ],
        }
        for f in field_pairs:
            out[f] = getattr(self, f)
            out[f + "_visible"] = getattr(self, f + "_visible")
        return out


class CardPhoto(db.Model):
    """One photo in a card's gallery. is_visible: allowed to be seen by
    others when they open the full profile. is_profile_photo: the ONE
    picture (at most) shown inline next to the name everywhere — selecting
    a new one automatically clears the flag on any other photo."""
    id = db.Column(db.String, primary_key=True, default=gen_id)
    card_id = db.Column(db.String, db.ForeignKey("card.id"), nullable=False)
    url = db.Column(db.Text, nullable=False)  # data URL for the demo
    is_visible = db.Column(db.Boolean, default=True)
    is_profile_photo = db.Column(db.Boolean, default=False)
    order = db.Column(db.Integer, default=0)
    created_at = db.Column(db.Float, default=time.time)


class HubBlock(db.Model):
    """A generic content block on a conference hub's page (spec §4 —
    optional modules like agenda, speakers, sponsors...). Kept generic
    (title + free text/image) rather than one table per module type: the
    organizer can represent any of those with a block, and specialized
    module types can be layered on top of this later without a schema
    change if that turns out to be needed."""
    id = db.Column(db.String, primary_key=True, default=gen_id)
    hub_id = db.Column(db.String, db.ForeignKey("hub.id"), nullable=False)
    category = db.Column(db.String, default="other")  # one of the preset picklist values, or 'other'
    title = db.Column(db.String, default="")
    content = db.Column(db.Text, default="")
    image_url = db.Column(db.Text, default="")  # data URL for the demo
    display_mode = db.Column(db.String, default="popup")  # 'popup' | 'inline' — organizer's choice per block
    order = db.Column(db.Integer, default=0)
    is_visible = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.Float, default=time.time)

    def public_dict(self):
        return {
            "id": self.id, "category": self.category, "title": self.title,
            "content": self.content, "image_url": self.image_url,
            "display_mode": self.display_mode,
            "order": self.order, "is_visible": self.is_visible,
        }


class Hub(db.Model):
    id = db.Column(db.String, primary_key=True, default=gen_id)
    owner_user_id = db.Column(db.String, db.ForeignKey("user.id"), nullable=False)
    owner = db.relationship("User", foreign_keys=[owner_user_id])
    owner_card_id = db.Column(db.String, db.ForeignKey("card.id"), nullable=True)

    name = db.Column(db.String, nullable=False)
    serial = db.Column(db.String, unique=True, nullable=True, index=True)  # 4-digit, for search/lookup
    hub_type = db.Column(db.String, default="social")  # 'social' | 'professional' | 'business'
    description = db.Column(db.String, default="")

    # Conference-specific required fields (spec §4.1). Kept on the base Hub
    # model rather than a separate table since only one hub type uses them
    # for now, and it avoids a join on every hub read.
    tagline = db.Column(db.String, default="")       # subtitle
    location = db.Column(db.String, default="")
    event_dates = db.Column(db.String, default="")   # free text, e.g. "Nov 14–16, 2026"
    logo_url = db.Column(db.Text, default="")         # data URL for the demo

    # Each optional field has its own independent show/hide toggle (spec §3),
    # separate from whether content was entered — the organizer can prepare
    # a field and still choose not to display it yet.
    tagline_visible = db.Column(db.Boolean, default=True)
    location_visible = db.Column(db.Boolean, default=True)
    event_dates_visible = db.Column(db.Boolean, default=True)
    logo_visible = db.Column(db.Boolean, default=True)

    # Bottom-of-page optional field (spec §3c) — free text the organizer types.
    organizer_names = db.Column(db.String, default="")
    organizer_names_visible = db.Column(db.Boolean, default=True)

    # Registration approval (spec §5). Off by default for existing hub
    # types — only meaningful when hub_type == 'professional'.
    auto_approve = db.Column(db.Boolean, default=False)

    # Design (spec §4.2): which of the 5 pre-built templates this hub uses.
    template_id = db.Column(db.String, default="corporate_classic")

    # Draft → preview → publish (spec §4.3). New professional hubs start
    # unpublished so the organizer can review before anyone can find/join.
    # Other hub types default True to keep their existing "instant" behavior.
    is_published = db.Column(db.Boolean, default=True)

    wifi_label = db.Column(db.String, default="")   # display-only name the owner types in
    owner_public_ip = db.Column(db.String, default="")  # used for the physical-presence heuristic

    background_image_url = db.Column(db.String, default="")
    background_music_url = db.Column(db.String, default="")

    is_open = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.Float, default=time.time)

    def public_dict(self, owner_card=None):
        return {
            "hub_id": self.id,
            "name": self.name,
            "serial": self.serial,
            "hub_type": self.hub_type,
            "description": self.description,
            "tagline": self.tagline,
            "location": self.location,
            "event_dates": self.event_dates,
            "logo_url": self.logo_url,
            "organizer_names": self.organizer_names,
            "tagline_visible": self.tagline_visible,
            "location_visible": self.location_visible,
            "event_dates_visible": self.event_dates_visible,
            "logo_visible": self.logo_visible,
            "organizer_names_visible": self.organizer_names_visible,
            "auto_approve": self.auto_approve,
            "template_id": self.template_id,
            "is_published": self.is_published,
            "owner_name": owner_card.display_name() if owner_card else "",
            "is_open": self.is_open,
            "background_image_url": self.background_image_url,
            "background_music_url": self.background_music_url,
        }


class Favorite(db.Model):
    id = db.Column(db.String, primary_key=True, default=gen_id)
    user_id = db.Column(db.String, db.ForeignKey("user.id"), nullable=False)
    hub_id = db.Column(db.String, db.ForeignKey("hub.id"), nullable=False)


class HubPresence(db.Model):
    """A person's membership + live state in a hub. For social/business hubs
    this row simply disappears when they leave (as before). For professional
    hubs it doubles as the persistent attendee-roster entry (spec §6 needs
    both a live "who's here now" list AND a full attendee directory that
    survives people going offline) — is_live distinguishes the two without
    a second table."""
    id = db.Column(db.String, primary_key=True, default=gen_id)
    hub_id = db.Column(db.String, db.ForeignKey("hub.id"), nullable=False)
    user_id = db.Column(db.String, db.ForeignKey("user.id"), nullable=False)
    card_id = db.Column(db.String, db.ForeignKey("card.id"), nullable=False)

    status = db.Column(db.String, default="green")  # 'green' open to comms | 'red' present, not available
    is_physical = db.Column(db.Boolean, default=False)  # same public IP as hub owner
    is_blocked = db.Column(db.Boolean, default=False)   # blocked by hub owner from posting
    is_live = db.Column(db.Boolean, default=True)        # currently connected (vs. roster-only / offline)

    # Registration approval (spec §5) — only meaningful for professional
    # hubs; everyone else defaults to 'approved' so existing behavior for
    # social/business hubs is untouched.
    approval_status = db.Column(db.String, default="approved")  # 'pending' | 'approved'

    joined_at = db.Column(db.Float, default=time.time)
    last_seen = db.Column(db.Float, default=time.time)


class BoardMessage(db.Model):
    id = db.Column(db.String, primary_key=True, default=gen_id)
    hub_id = db.Column(db.String, db.ForeignKey("hub.id"), nullable=False)
    sender_user_id = db.Column(db.String, db.ForeignKey("user.id"), nullable=False)
    sender_card_id = db.Column(db.String, db.ForeignKey("card.id"), nullable=False)
    text = db.Column(db.Text, default="")
    image_url = db.Column(db.Text, default="")
    ts = db.Column(db.Float, default=time.time)


class PrivateMessage(db.Model):
    id = db.Column(db.String, primary_key=True, default=gen_id)
    # Nullable: a message sent from "My Messages" (e.g. a reply, or a message
    # to a whole contact group) isn't necessarily tied to a live hub session.
    hub_id = db.Column(db.String, db.ForeignKey("hub.id"), nullable=True)
    from_user_id = db.Column(db.String, db.ForeignKey("user.id"), nullable=False)
    to_user_id = db.Column(db.String, db.ForeignKey("user.id"), nullable=False)
    text = db.Column(db.Text, default="")
    image_url = db.Column(db.Text, default="")
    ts = db.Column(db.Float, default=time.time)


class ContactGroup(db.Model):
    """A user-defined sub-group inside 'My Contacts', e.g. 'Close friends'."""
    id = db.Column(db.String, primary_key=True, default=gen_id)
    owner_user_id = db.Column(db.String, db.ForeignKey("user.id"), nullable=False)
    name = db.Column(db.String, nullable=False)
    created_at = db.Column(db.Float, default=time.time)


class ContactShare(db.Model):
    """A card someone sent me, saved into 'My Contacts'."""
    id = db.Column(db.String, primary_key=True, default=gen_id)
    owner_user_id = db.Column(db.String, db.ForeignKey("user.id"), nullable=False)  # who received it
    from_user_id = db.Column(db.String, db.ForeignKey("user.id"), nullable=False)
    hub_id = db.Column(db.String, db.ForeignKey("hub.id"), nullable=False)
    hub_name_snapshot = db.Column(db.String, default="")
    group_id = db.Column(db.String, db.ForeignKey("contact_group.id"), nullable=True)

    card_snapshot = db.Column(db.JSON, default=dict)  # the fields that were shared, frozen at send time
    note = db.Column(db.Text, default="")  # "my notes" the receiver added when saving
    ts = db.Column(db.Float, default=time.time)
