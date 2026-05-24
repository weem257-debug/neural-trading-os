"""
WebSocket Connection Manager
-----------------------------
Manages real-time connections for live data streaming to the frontend.

Channels:
  - "signals"   — new AI signal events
  - "portfolio" — portfolio value updates (every 5s)
  - "sentiment" — new sentiment scores
  - "prices"    — tick price updates
  - "alerts"    — risk alerts
"""
import asyncio
import json
import logging
from datetime import datetime, UTC
from typing import Optional
from fastapi import WebSocket, WebSocketDisconnect

logger = logging.getLogger(__name__)


class WebSocketManager:
    def __init__(self):
        # channel → list of active WebSocket connections
        self._connections: dict[str, list[WebSocket]] = {
            "signals": [],
            "portfolio": [],
            "sentiment": [],
            "prices": [],
            "alerts": [],
            "all": [],           # receives all events
        }
        self._price_feed_task: Optional[asyncio.Task] = None

    async def connect(self, websocket: WebSocket, channel: str = "all") -> None:
        """Accept a new WebSocket connection and register it to a channel."""
        await websocket.accept()
        channel = channel if channel in self._connections else "all"
        self._connections[channel].append(websocket)
        self._connections["all"].append(websocket) if channel != "all" else None
        logger.info(
            "WebSocket connected: channel=%s, total=%d",
            channel,
            sum(len(v) for v in self._connections.values()),
        )
        # Send welcome message
        await self._send_to(websocket, {
            "type": "connected",
            "channel": channel,
            "timestamp": datetime.now(UTC).isoformat(),
        })

    async def disconnect(self, websocket: WebSocket, channel: str = "all") -> None:
        """Remove a disconnected WebSocket from all channels."""
        for ch_connections in self._connections.values():
            if websocket in ch_connections:
                ch_connections.remove(websocket)

    async def broadcast(self, channel: str, data: dict) -> None:
        """Broadcast a message to all connections on a channel."""
        targets = list(self._connections.get(channel, []))
        # Also broadcast to "all" subscribers
        if channel != "all":
            targets += list(self._connections.get("all", []))

        disconnected = []
        for ws in targets:
            try:
                await self._send_to(ws, data)
            except Exception:
                disconnected.append(ws)

        # Clean up dead connections
        for ws in disconnected:
            await self.disconnect(ws)

    async def _send_to(self, websocket: WebSocket, data: dict) -> None:
        """Send JSON message to a single WebSocket."""
        await websocket.send_text(json.dumps(data, default=str))

    def connection_count(self, channel: str = "all") -> int:
        return len(self._connections.get(channel, []))



# Module-level singleton
ws_manager = WebSocketManager()
