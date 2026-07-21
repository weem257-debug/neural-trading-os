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
        # Per-connection owner binding (F-12 / F-17). Maps each live socket to
        # the username that authenticated it, so owner-scoped broadcasts (e.g.
        # price alerts) never leak one user's data to another authenticated
        # user subscribed to the same shared channel.
        self._user_by_ws: "dict[WebSocket, Optional[str]]" = {}
        self._price_feed_task: Optional[asyncio.Task] = None

    async def connect(
        self,
        websocket: WebSocket,
        channel: str = "all",
        subprotocol: Optional[str] = None,
        username: Optional[str] = None,
    ) -> None:
        """Accept a new WebSocket connection and register it to a channel.

        `subprotocol` — when auth was carried via the Sec-WebSocket-Protocol
        handshake header, echo the same value back so the client's WebSocket
        handshake completes correctly (a subprotocol offered by the client
        must be acknowledged by the server, or negotiation fails per RFC 6455).
        """
        await websocket.accept(subprotocol=subprotocol)
        channel = channel if channel in self._connections else "all"
        self._connections[channel].append(websocket)
        self._connections["all"].append(websocket) if channel != "all" else None
        self._user_by_ws[websocket] = username
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
        self._user_by_ws.pop(websocket, None)

    async def broadcast(
        self, channel: str, data: dict, owner_username: Optional[str] = None
    ) -> None:
        """Broadcast a message to all connections on a channel.

        When ``owner_username`` is given, the message is delivered ONLY to
        connections that authenticated as that user (F-12 / F-17). This is used
        for user-private events such as fired price alerts, which carry the
        owner's username/ticker/threshold and must never be broadcast to other
        authenticated subscribers of the shared channel. Connections whose owner
        could not be determined (None) are treated as non-matching → fail closed.
        """
        targets = list(self._connections.get(channel, []))
        # Also broadcast to "all" subscribers
        if channel != "all":
            targets += list(self._connections.get("all", []))

        # De-dup (a socket may be in both `channel` and `all`) while filtering
        # by owner for user-private broadcasts.
        seen: set = set()
        disconnected = []
        for ws in targets:
            if ws in seen:
                continue
            seen.add(ws)
            if owner_username is not None and self._user_by_ws.get(ws) != owner_username:
                continue
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
