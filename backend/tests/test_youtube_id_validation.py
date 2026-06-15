"""
Regression tests for YouTube video-id validation — P1-4 security hardening.
===========================================================================

`_get_video_info_sync` interpolates the caller-supplied video id into the URL
passed to urllib.request.urlopen (YouTube oEmbed). Without validation a crafted
id (e.g. "x&url=http://attacker") can inject extra query parameters into the
request — a parameter-injection / SSRF-shaped issue (Bandit B310 / CWE-22).

These tests pin the boundary validation that makes the Bandit `# nosec`
justified: only canonical 11-char ids reach the network call; anything else is
rejected without issuing a request.

Run:
    cd dashboard/backend
    pytest tests/test_youtube_id_validation.py -v
"""
from unittest.mock import patch

import pytest

from app.services.learning import youtube_learner as yl


# ---------------------------------------------------------------------------
# _is_valid_video_id — truth table
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("vid", [
    "dDhz-VHtGhQ",   # real-shaped id
    "abcDEF123_-",   # all allowed char classes, 11 chars
    "00000000000",
])
def test_valid_ids_accepted(vid):
    assert yl._is_valid_video_id(vid) is True


@pytest.mark.parametrize("vid", [
    "",                       # empty
    "short",                  # too short
    "toolongvideoid12",       # too long
    "abc&url=http://evil",    # injection attempt
    "abcdefghij?",            # illegal char
    "abcdefghij ",            # trailing space
    "../../etc/passwd",       # path traversal shape
    "abcdefghi\n1",           # newline
])
def test_malformed_ids_rejected(vid):
    assert yl._is_valid_video_id(vid) is False


# ---------------------------------------------------------------------------
# _get_video_info_sync — fail closed, never call urlopen for bad ids
# ---------------------------------------------------------------------------

def test_malformed_id_never_hits_network():
    with patch("urllib.request.urlopen") as mock_open:
        result = yl._get_video_info_sync("x&url=http://attacker.example")
        mock_open.assert_not_called()
    assert result["title"] == "Unbekanntes Video"
    assert result["channel"] == "Unbekannter Kanal"


def test_valid_id_builds_encoded_oembed_url():
    captured = {}

    class _FakeResp:
        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def read(self):
            return b'{"title": "T", "author_name": "C"}'

    def _fake_urlopen(url, timeout=10):
        captured["url"] = url
        return _FakeResp()

    with patch("urllib.request.urlopen", side_effect=_fake_urlopen):
        result = yl._get_video_info_sync("dDhz-VHtGhQ")

    # The watch URL is percent-encoded into the `url=` parameter — no raw
    # "://" from the inner URL leaks unescaped into the query string.
    assert "url=https%3A" in captured["url"]
    assert captured["url"].startswith("https://www.youtube.com/oembed?")
    assert result == {"title": "T", "channel": "C"}
