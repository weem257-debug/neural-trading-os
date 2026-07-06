"""Single source of truth for resolving a user's *effective* subscription plan.

Historically two independent code paths derived the plan and drifted apart:

  * ``GET /api/billing/usage`` (dashboard quota *display*) and
    ``signals._check_signal_quota`` (quota *enforcement*) both read **only** the
    ``Subscription`` table, defaulting to ``"free"`` when no row existed.
  * ``User.tier`` carried the real entitlement grant — synced from Stripe
    webhooks *and* settable directly by an admin — which those paths ignored.

A PRO user without a ``Subscription`` row therefore *saw* (and was *enforced*
at) the free limit — the 0/3 quota bug. ``resolve_plan`` unifies the precedence
so display and enforcement always agree, while keeping Stripe authoritative for
paid plans.

Precedence (highest first):
  1. Active, paid Stripe subscription — the webhook keeps ``Subscription.plan``
     and ``.status`` current, so a real purchase is never overridden by a stale
     tier.
  2. ``User.tier`` — admin/manual grants that never went through Stripe.
  3. ``"free"`` — default.
"""
from __future__ import annotations

from typing import Optional, Protocol, runtime_checkable

# Stripe subscription statuses in which the plan is NOT currently in force.
# Anything else (active, trialing, past_due, ...) retains paid access — a
# past_due sub is still within Stripe's dunning grace window.
_INACTIVE_SUB_STATUSES = frozenset({
    "canceled",
    "cancelled",
    "incomplete",
    "incomplete_expired",
    "unpaid",
})


@runtime_checkable
class _SubscriptionLike(Protocol):
    plan: Optional[str]
    status: Optional[str]


def resolve_plan(sub: Optional[_SubscriptionLike], user_tier: Optional[str]) -> str:
    """Return the effective plan key (``free`` | ``basic`` | ``pro`` | ...).

    An active, paid Stripe subscription always wins so a Stripe purchase is
    never overridden by a stale tier grant. Otherwise fall back to the user's
    tier, then to ``"free"``. Matching is case-insensitive.

    ``sub`` may be ``None`` (no subscription row) or any object exposing
    ``.plan`` / ``.status`` (the ORM ``Subscription`` model in production).
    """
    if sub is not None:
        sub_plan = (getattr(sub, "plan", None) or "").strip().lower()
        sub_status = (getattr(sub, "status", None) or "").strip().lower()
        if sub_plan and sub_plan != "free" and sub_status not in _INACTIVE_SUB_STATUSES:
            return sub_plan

    tier = (user_tier or "").strip().lower()
    if tier and tier != "free":
        return tier

    return "free"
