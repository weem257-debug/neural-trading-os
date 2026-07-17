"""
YouTube Trading Knowledge Learner
====================================
Fetches YouTube video transcripts (no API key needed via youtube-transcript-api)
and uses Claude Haiku to extract actionable trading insights.

Configured channels are processed daily via the background scheduler.

Default channel: a curated list of high-quality trading educators.
Users can add more via the /api/learning/youtube/channels endpoint.
"""
import asyncio
import json
import logging
import os
import re
from datetime import datetime, UTC
from typing import Optional

logger = logging.getLogger(__name__)

# Canonical YouTube video-ID shape: exactly 11 chars of [A-Za-z0-9_-].
# Validating at the service boundary prevents URL/parameter injection into the
# oEmbed request (Bandit B310 / CWE-22): a crafted id such as
# "x&url=http://attacker" must never reach urllib.request.urlopen.
_VIDEO_ID_RE = re.compile(r"^[A-Za-z0-9_-]{11}$")


def _is_valid_video_id(video_id: str) -> bool:
    """True only for a syntactically valid YouTube video id."""
    return bool(video_id) and bool(_VIDEO_ID_RE.match(video_id))

# ---------------------------------------------------------------------------
# Default channels to track (YouTube video IDs, not channel IDs)
# Seed list — grows over time as new videos are processed
# ---------------------------------------------------------------------------

# These are example video IDs from popular trading educators.
# The system will add new videos automatically when channels are configured.
_DEFAULT_VIDEO_IDS: list[str] = [
    # Rayner Teo — Technical Analysis
    "dDhz-VHtGhQ",
    # SMB Capital — Options / Day Trading
    "YWH2Gty6_YA",
    # The Chart Guys — Swing Trading
    "Lf2VEKH07sg",
]

# ---------------------------------------------------------------------------
# Claude Haiku extraction prompt
# ---------------------------------------------------------------------------

_EXTRACTION_PROMPT = """You are a professional trading analyst. Analyze this excerpt from a trading education YouTube video.

Extract the KEY TRADING INSIGHTS in a structured format. Focus on:
- Specific strategies with clear entry/exit rules
- Market patterns that have historical relevance
- Risk management principles
- Which market conditions each strategy works best in
- Common mistakes to avoid

Video title: {title}
Channel: {channel}

Transcript excerpt:
{transcript}

Respond with a JSON object:
{{
  "insight_text": "2-3 paragraph summary of the key trading knowledge, written as actionable advice",
  "strategy": "primary strategy name (e.g. 'breakout', 'mean_reversion', 'momentum', 'swing_trade', 'scalp')",
  "timeframe": "primary timeframe (e.g. '1d', '4h', '1h', 'swing', 'position')",
  "market_condition": "when this works best (e.g. 'trending', 'ranging', 'volatile', 'any')",
  "asset_class": "asset focus (e.g. 'equities', 'crypto', 'forex', 'options', 'any')",
  "confidence_score": 0.85,
  "tags": ["tag1", "tag2", "tag3"]
}}

If the content has no trading value, return {{"insight_text": "NO_INSIGHT", "confidence_score": 0.0}}
"""

# ---------------------------------------------------------------------------
# Transcript fetcher
# ---------------------------------------------------------------------------

def _fetch_transcript_sync(video_id: str) -> tuple[str, str]:
    """
    Fetch YouTube transcript synchronously.
    Returns (transcript_text, error_message).
    Must run in asyncio.to_thread() — youtube-transcript-api is sync.
    """
    try:
        from youtube_transcript_api import YouTubeTranscriptApi
        from youtube_transcript_api.formatters import TextFormatter

        # youtube-transcript-api v1.0 removed the static ``get_transcript()``.
        # The supported surface is the instance method ``fetch()`` which returns
        # a ``FetchedTranscript``; ``TextFormatter`` accepts that object directly.
        # Try English first, then the auto-generated English variants.
        ytt_api = YouTubeTranscriptApi()
        fetched = ytt_api.fetch(
            video_id,
            languages=["en", "en-US", "en-GB"],
        )
        formatter = TextFormatter()
        text = formatter.format_transcript(fetched)
        return text[:8000], ""  # Cap at 8000 chars to fit Claude context
    except Exception as e:
        return "", str(e)[:200]


def _get_video_info_sync(video_id: str) -> dict:
    """
    Get basic video info from YouTube oEmbed API (no API key needed).
    Returns {"title": ..., "channel": ...} or defaults on failure.
    """
    if not _is_valid_video_id(video_id):
        logger.warning("Rejected malformed video_id in _get_video_info_sync")
        return {"title": "Unbekanntes Video", "channel": "Unbekannter Kanal"}
    try:
        import urllib.request
        import urllib.parse
        # Build the watch URL from the validated id and percent-encode the whole
        # value before embedding it as the oEmbed `url` query parameter. The id
        # is already constrained to [A-Za-z0-9_-]{11}, so this is defence in
        # depth against parameter injection (B310 / CWE-22).
        watch_url = f"https://youtube.com/watch?v={video_id}"
        url = "https://www.youtube.com/oembed?url=" + urllib.parse.quote(watch_url, safe="") + "&format=json"
        with urllib.request.urlopen(url, timeout=10) as resp:  # nosec B310 — fixed https host, validated+encoded video id
            data = json.loads(resp.read())
            return {
                "title": data.get("title", f"Video {video_id}"),
                "channel": data.get("author_name", "Unbekannter Kanal"),
            }
    except Exception:
        return {"title": f"Video {video_id}", "channel": "Unbekannter Kanal"}


# ---------------------------------------------------------------------------
# Claude extraction
# ---------------------------------------------------------------------------

async def _extract_insights_with_claude(
    video_id: str,
    title: str,
    channel: str,
    transcript: str,
) -> Optional[dict]:
    """Call Claude Haiku to extract trading insights from transcript."""
    api_key = os.getenv("ANTHROPIC_API_KEY", "")
    if not api_key:
        logger.warning("ANTHROPIC_API_KEY not set — using keyword extraction fallback")
        return _keyword_extraction_fallback(transcript, title)

    try:
        import anthropic
        client = anthropic.AsyncAnthropic(api_key=api_key)

        prompt = _EXTRACTION_PROMPT.format(
            title=title,
            channel=channel,
            transcript=transcript,
        )

        message = await client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=1024,
            messages=[{"role": "user", "content": prompt}],
        )

        text = message.content[0].text.strip()

        # Extract JSON from response
        if "```json" in text:
            text = text.split("```json")[1].split("```")[0].strip()
        elif "```" in text:
            text = text.split("```")[1].split("```")[0].strip()

        return json.loads(text)

    except json.JSONDecodeError:
        return None
    except Exception as e:
        logger.error("Claude extraction failed for %s: %s", video_id, e)
        return None


def _keyword_extraction_fallback(transcript: str, title: str) -> dict:
    """
    Simple keyword-based extraction when Claude is unavailable.
    Not as good but still useful for retrieval.
    """
    strategies = ["breakout", "mean reversion", "momentum", "swing", "scalp", "trend following"]
    found_strategies = [s for s in strategies if s.lower() in transcript.lower()]

    return {
        "insight_text": f"Trading-Inhalt: {title}. Hauptthemen: {', '.join(found_strategies) if found_strategies else 'allgemeines Trading'}. Inhalt: {transcript[:500]}...",
        "strategy": found_strategies[0] if found_strategies else "general",
        "timeframe": "swing" if "swing" in transcript.lower() else "1d",
        "market_condition": "any",
        "asset_class": "equities" if any(w in transcript.lower() for w in ["stock", "equity", "nasdaq"]) else "any",
        "confidence_score": 0.4,
        "tags": found_strategies[:3],
    }


# ---------------------------------------------------------------------------
# Main processing function
# ---------------------------------------------------------------------------

async def process_video(video_id: str, db_session) -> Optional[dict]:
    """
    Full pipeline: fetch transcript → extract insights → persist.
    Returns the insight dict if successful, None if already processed or failed.

    db_session: AsyncSession from get_session()
    """
    from sqlalchemy import select
    from app.db.models import YoutubeInsight

    # Skip if already processed
    async with db_session as session:
        existing = await session.execute(
            select(YoutubeInsight).where(YoutubeInsight.video_id == video_id)
        )
        if existing.scalar_one_or_none():
            logger.info("Video %s already processed — skipping", video_id)
            return None

    # Fetch video info + transcript (blocking I/O in threads)
    info, (transcript, transcript_err) = await asyncio.gather(
        asyncio.to_thread(_get_video_info_sync, video_id),
        asyncio.to_thread(_fetch_transcript_sync, video_id),
    )

    if transcript_err or not transcript:
        logger.warning("Transcript unavailable for %s: %s", video_id, transcript_err)
        return None

    # Extract insights with Claude
    extracted = await _extract_insights_with_claude(
        video_id=video_id,
        title=info["title"],
        channel=info["channel"],
        transcript=transcript,
    )

    if not extracted or extracted.get("insight_text", "") == "NO_INSIGHT":
        logger.info("No trading insight found in video %s", video_id)
        return None

    # Persist
    insight = YoutubeInsight(
        video_id=video_id,
        video_title=info["title"][:300],
        channel=info["channel"][:150],
        insight_text=extracted.get("insight_text", "")[:5000],
        tags_json=json.dumps(extracted.get("tags", [])),
        strategy=extracted.get("strategy", "general")[:100],
        timeframe=extracted.get("timeframe", "1d")[:20],
        market_condition=extracted.get("market_condition", "any")[:50],
        asset_class=extracted.get("asset_class", "any")[:50],
        confidence_score=float(extracted.get("confidence_score", 0.5)),
        created_at=datetime.now(UTC),
    )

    from app.db.database import get_session
    async with get_session() as session:
        session.add(insight)
        await session.commit()
        await session.refresh(insight)

    logger.info(
        "Processed YouTube video: %s — strategy=%s confidence=%.2f",
        info["title"][:60],
        insight.strategy,
        insight.confidence_score,
    )
    return extracted


async def run_batch(video_ids: Optional[list[str]] = None) -> dict:
    """
    Process a batch of YouTube videos.
    Uses _DEFAULT_VIDEO_IDS if no list provided.
    """
    ids = video_ids or _DEFAULT_VIDEO_IDS
    processed = 0
    skipped = 0
    failed = 0

    from app.db.database import get_session

    for video_id in ids:
        try:
            result = await process_video(video_id, get_session())
            if result is not None:
                processed += 1
            else:
                skipped += 1
            # Polite delay between requests
            await asyncio.sleep(2)
        except Exception as e:
            logger.error("Batch processing failed for %s: %s", video_id, e)
            failed += 1

    return {"processed": processed, "skipped": skipped, "failed": failed, "total": len(ids)}
