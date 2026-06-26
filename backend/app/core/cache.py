"""
In-Memory Cache with TTL and LRU Eviction
------------------------------------------
Provides two decorators:
  @cached(ttl_seconds=N)       — for sync functions
  @async_cached(ttl_seconds=N) — for async functions

Max 200 entries; LRU eviction removes the oldest entry when full.
Thread-safe for the sync variant; asyncio-safe for the async variant.

Usage:
    from app.core.cache import cached, async_cached

    @cached(ttl_seconds=10)
    def get_price(ticker: str) -> float:
        ...

    @async_cached(ttl_seconds=30)
    async def get_snapshot() -> dict:
        ...
"""
from __future__ import annotations

import asyncio
import functools
import time
import threading
from collections import OrderedDict
from typing import Any, Callable, Optional, TypeVar

_MAX_ENTRIES = 200

F = TypeVar("F", bound=Callable[..., Any])


class _CacheEntry:
    __slots__ = ("value", "expires_at")

    def __init__(self, value: Any, ttl: float) -> None:
        self.value = value
        self.expires_at = time.monotonic() + ttl


# ---------------------------------------------------------------------------
# Shared LRU backing store
# ---------------------------------------------------------------------------

class _LRUStore:
    """Thread-safe LRU cache with TTL support."""

    def __init__(self, max_size: int = _MAX_ENTRIES) -> None:
        self._store: OrderedDict[str, _CacheEntry] = OrderedDict()
        self._max_size = max_size
        self._lock = threading.Lock()

    def get(self, key: str) -> Optional[Any]:
        with self._lock:
            entry = self._store.get(key)
            if entry is None:
                return _MISS
            if time.monotonic() >= entry.expires_at:
                del self._store[key]
                return _MISS
            # Move to end (most recently used)
            self._store.move_to_end(key)
            return entry.value

    def set(self, key: str, value: Any, ttl: float) -> None:
        with self._lock:
            if key in self._store:
                self._store.move_to_end(key)
            self._store[key] = _CacheEntry(value, ttl)
            # Evict oldest entry if over capacity
            while len(self._store) > self._max_size:
                self._store.popitem(last=False)

    def invalidate(self, key: str) -> None:
        with self._lock:
            self._store.pop(key, None)

    def clear(self) -> int:
        with self._lock:
            count = len(self._store)
            self._store.clear()
            return count

    def size(self) -> int:
        with self._lock:
            return len(self._store)


# Sentinel — distinct from None so None can be cached
class _Miss:
    pass


_MISS = _Miss()

# Global store shared by all cached functions
_store = _LRUStore()


def _make_key(fn: Callable, args: tuple, kwargs: dict) -> str:
    """Build a deterministic cache key from function name + arguments."""
    return f"{fn.__module__}.{fn.__qualname__}:{args!r}:{sorted(kwargs.items())!r}"


# ---------------------------------------------------------------------------
# Decorators
# ---------------------------------------------------------------------------

def cached(ttl_seconds: float = 30) -> Callable[[F], F]:
    """
    Decorator for *sync* functions.

    Example:
        @cached(ttl_seconds=10)
        def get_price(ticker: str) -> float:
            ...
    """
    def decorator(fn: F) -> F:
        @functools.wraps(fn)
        def wrapper(*args: Any, **kwargs: Any) -> Any:
            key = _make_key(fn, args, kwargs)
            result = _store.get(key)
            if not isinstance(result, _Miss):
                return result
            value = fn(*args, **kwargs)
            _store.set(key, value, ttl_seconds)
            return value

        # Expose cache management helpers
        wrapper.cache_invalidate = lambda *a, **kw: _store.invalidate(  # type: ignore[attr-defined]
            _make_key(fn, a, kw)
        )
        wrapper.cache_clear = _store.clear  # type: ignore[attr-defined]
        return wrapper  # type: ignore[return-value]

    return decorator


def async_cached(ttl_seconds: float = 30) -> Callable[[F], F]:
    """
    Decorator for *async* functions.

    Example:
        @async_cached(ttl_seconds=30)
        async def get_snapshot() -> dict:
            ...
    """
    # Per-key asyncio locks to prevent thundering herd
    _locks: dict[str, asyncio.Lock] = {}
    _meta_lock = threading.Lock()

    def _get_lock(key: str) -> asyncio.Lock:
        with _meta_lock:
            if key not in _locks:
                _locks[key] = asyncio.Lock()
            return _locks[key]

    def decorator(fn: F) -> F:
        @functools.wraps(fn)
        async def wrapper(*args: Any, **kwargs: Any) -> Any:
            key = _make_key(fn, args, kwargs)

            # Fast path — already cached
            result = _store.get(key)
            if not isinstance(result, _Miss):
                return result

            # Serialise concurrent callers for the same key
            lock = _get_lock(key)
            async with lock:
                # Re-check after acquiring lock
                result = _store.get(key)
                if not isinstance(result, _Miss):
                    return result

                value = await fn(*args, **kwargs)
                _store.set(key, value, ttl_seconds)
                return value

        wrapper.cache_invalidate = lambda *a, **kw: _store.invalidate(  # type: ignore[attr-defined]
            _make_key(fn, a, kw)
        )
        wrapper.cache_clear = _store.clear  # type: ignore[attr-defined]
        return wrapper  # type: ignore[return-value]

    return decorator


# ---------------------------------------------------------------------------
# Global helpers
# ---------------------------------------------------------------------------

def cache_get(key: str) -> Optional[Any]:
    """Return the cached value for `key`, or None if absent/expired.

    Note: a cached value of literal None is indistinguishable from a miss here.
    Use this only for callers that never cache None (e.g. dict payloads).
    """
    value = _store.get(key)
    return None if isinstance(value, _Miss) else value


def cache_set(key: str, value: Any, ttl_seconds: float = 30) -> None:
    """Store `value` under `key` for `ttl_seconds`."""
    _store.set(key, value, ttl_seconds)


def cache_clear_all() -> int:
    """Clear the entire global cache. Returns number of entries removed."""
    return _store.clear()


def cache_size() -> int:
    """Return current number of cache entries."""
    return _store.size()


# ---------------------------------------------------------------------------
# BoundedDedupSet — memory-safe "have I already done X?" marker set
# ---------------------------------------------------------------------------

class BoundedDedupSet:
    """A set with a hard upper bound and FIFO eviction.

    Background processing loops use module-level ``set()`` markers to avoid
    re-sending the same notification (keys like ``"user:ticker:YYYY-MM-DD"``).
    In a long-lived worker process those sets grow without limit — one entry
    per unique event, forever — a slow but real memory leak.

    This drop-in replacement keeps at most ``maxsize`` recent keys and evicts
    the oldest first. The semantics callers rely on are preserved:
      - ``key in s``        → membership test
      - ``s.add(key)``      → mark as seen
      - ``s.discard(key)``  → forget (e.g. on unsubscribe re-subscribe)

    Eviction is per-day-style keys friendly: the oldest markers fall out long
    after their relevant day has passed, so re-sends are not a practical risk
    at any sane ``maxsize``. Thread-safe (loops may run under different threads).
    """

    __slots__ = ("_maxsize", "_data", "_lock")

    def __init__(self, maxsize: int = 50_000) -> None:
        if maxsize < 1:
            raise ValueError("maxsize must be >= 1")
        self._maxsize = maxsize
        self._data: "OrderedDict[str, None]" = OrderedDict()
        self._lock = threading.Lock()

    def add(self, key: str) -> None:
        with self._lock:
            if key in self._data:
                self._data.move_to_end(key)
            else:
                self._data[key] = None
                if len(self._data) > self._maxsize:
                    self._data.popitem(last=False)  # evict oldest

    def discard(self, key: str) -> None:
        with self._lock:
            self._data.pop(key, None)

    def __contains__(self, key: object) -> bool:
        with self._lock:
            return key in self._data

    def __len__(self) -> int:
        with self._lock:
            return len(self._data)

    def clear(self) -> None:
        with self._lock:
            self._data.clear()
