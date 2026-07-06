"""Unit tests for the shared plan resolver (app/core/plans.py).

``resolve_plan`` is the single source of truth that unifies the dashboard quota
*display* (``/api/billing/usage``) and the quota *enforcement*
(``signals._check_signal_quota``). These tests pin the fallback precedence that
fixes the 0/3-quota bug (a PRO user without a Subscription row shown/enforced at
the free limit).

Precedence: active paid Stripe subscription > User.tier > "free".
"""
from types import SimpleNamespace

import pytest

from app.core.plans import resolve_plan


def _sub(plan, status="active"):
    """Minimal Subscription-like stand-in (duck-typed .plan / .status)."""
    return SimpleNamespace(plan=plan, status=status)


# ---------------------------------------------------------------------------
# Tier fallback (no / non-paying subscription) — the actual bug
# ---------------------------------------------------------------------------

class TestTierFallback:
    def test_pro_tier_without_subscription_resolves_pro(self):
        # THE bug: PRO user, no Subscription row → must be "pro" (50/day), not free.
        assert resolve_plan(None, "pro") == "pro"

    def test_basic_tier_without_subscription_resolves_basic(self):
        assert resolve_plan(None, "basic") == "basic"

    def test_institutional_tier_without_subscription_resolves_institutional(self):
        assert resolve_plan(None, "institutional") == "institutional"

    def test_free_tier_without_subscription_resolves_free(self):
        assert resolve_plan(None, "free") == "free"

    def test_no_sub_no_tier_resolves_free(self):
        assert resolve_plan(None, None) == "free"

    def test_empty_tier_resolves_free(self):
        assert resolve_plan(None, "") == "free"

    def test_tier_is_case_insensitive(self):
        # Defensive: memory noted "tier=PRO" (uppercase) in the wild.
        assert resolve_plan(None, "PRO") == "pro"
        assert resolve_plan(None, "Pro") == "pro"


# ---------------------------------------------------------------------------
# Active paid subscription wins (Stripe stays authoritative)
# ---------------------------------------------------------------------------

class TestSubscriptionWins:
    def test_active_paid_sub_overrides_lower_tier(self):
        # Stripe purchase must never be overridden by a stale/lower tier.
        assert resolve_plan(_sub("pro"), "free") == "pro"

    def test_active_paid_sub_overrides_when_tier_missing(self):
        assert resolve_plan(_sub("basic"), None) == "basic"

    def test_active_paid_sub_beats_different_tier(self):
        # Real purchase (pro) beats a leftover basic tier grant.
        assert resolve_plan(_sub("pro"), "basic") == "pro"

    def test_trialing_paid_sub_is_active(self):
        assert resolve_plan(_sub("pro", status="trialing"), "free") == "pro"

    def test_past_due_sub_keeps_paid_access_grace(self):
        # Dunning grace window — access retained until Stripe cancels.
        assert resolve_plan(_sub("pro", status="past_due"), "free") == "pro"

    def test_sub_plan_is_case_insensitive(self):
        assert resolve_plan(_sub("PRO"), "free") == "pro"


# ---------------------------------------------------------------------------
# Inactive / free subscription falls back to tier
# ---------------------------------------------------------------------------

class TestInactiveSubFallsBackToTier:
    @pytest.mark.parametrize("status", ["canceled", "cancelled", "unpaid",
                                        "incomplete", "incomplete_expired"])
    def test_inactive_sub_falls_back_to_tier(self, status):
        # A canceled/unpaid sub must not grant paid access; tier decides.
        assert resolve_plan(_sub("pro", status=status), "basic") == "basic"

    def test_inactive_sub_and_free_tier_resolves_free(self):
        assert resolve_plan(_sub("pro", status="canceled"), "free") == "free"

    def test_free_plan_sub_falls_back_to_tier(self):
        # After cancellation the webhook sets sub.plan="free"; a still-elevated
        # tier grant should then take over.
        assert resolve_plan(_sub("free", status="active"), "pro") == "pro"

    def test_free_plan_sub_and_free_tier_resolves_free(self):
        assert resolve_plan(_sub("free", status="active"), "free") == "free"

    def test_null_plan_sub_falls_back_to_tier(self):
        assert resolve_plan(_sub(None), "pro") == "pro"
