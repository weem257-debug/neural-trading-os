"""
Regression tests for BoundedDedupSet — P1-5 memory-leak guard.
==============================================================

Background notification loops use module-level marker sets ("have I already
sent X to this user today?"). As plain set() objects they grow forever in a
long-lived process. BoundedDedupSet caps the size with FIFO eviction while
preserving the membership / add / discard semantics callers rely on.

Run:
    cd dashboard/backend
    pytest tests/test_bounded_dedup_set.py -v
"""
import pytest

from app.core.cache import BoundedDedupSet


def test_basic_membership_and_add():
    s = BoundedDedupSet(maxsize=10)
    assert "a" not in s
    s.add("a")
    assert "a" in s
    assert len(s) == 1


def test_add_is_idempotent():
    s = BoundedDedupSet(maxsize=10)
    s.add("a")
    s.add("a")
    assert len(s) == 1


def test_discard_forgets_key():
    s = BoundedDedupSet(maxsize=10)
    s.add("a")
    s.discard("a")
    assert "a" not in s
    # discarding an absent key is a no-op (no raise)
    s.discard("missing")


def test_fifo_eviction_at_capacity():
    s = BoundedDedupSet(maxsize=3)
    for k in ("k0", "k1", "k2"):
        s.add(k)
    assert len(s) == 3
    s.add("k3")  # evicts oldest (k0)
    assert len(s) == 3
    assert "k0" not in s
    assert "k1" in s and "k2" in s and "k3" in s


def test_readding_refreshes_recency():
    s = BoundedDedupSet(maxsize=3)
    s.add("k0")
    s.add("k1")
    s.add("k2")
    s.add("k0")   # touch k0 → now most recent; k1 is oldest
    s.add("k3")   # evicts k1, not k0
    assert "k1" not in s
    assert "k0" in s


def test_never_exceeds_maxsize_under_load():
    s = BoundedDedupSet(maxsize=100)
    for i in range(10_000):
        s.add(f"user{i}:2026-06-15")
    assert len(s) == 100


def test_invalid_maxsize_rejected():
    with pytest.raises(ValueError):
        BoundedDedupSet(maxsize=0)


def test_clear_empties_the_set():
    s = BoundedDedupSet(maxsize=10)
    s.add("a")
    s.add("b")
    s.clear()
    assert len(s) == 0
    assert "a" not in s
