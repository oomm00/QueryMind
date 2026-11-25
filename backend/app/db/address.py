"""Cached DB address so a stopped Docker service fails fast.

Docker DNS can spend ~8s failing to resolve a stopped service name. Resolve the
host once while it is healthy, keep using that address, and refresh it in the
background after a failure so a restarted DB is found without a backend restart.
"""

from __future__ import annotations

import logging
import socket
import threading

from sqlalchemy.engine import make_url

from app.core.config import settings

logger = logging.getLogger("querymind.db.address")

_lock = threading.Lock()
_ip: str | None = None
_refreshing = False


def _dns_lookup() -> str | None:
    url = make_url(settings.database_url)
    if not url.host:
        return None
    try:
        return socket.getaddrinfo(url.host, url.port or 5432, type=socket.SOCK_STREAM)[0][4][0]
    except Exception:
        return None


def current_ip() -> str | None:
    global _ip
    with _lock:
        if _ip:
            return _ip
    found = _dns_lookup()
    if found:
        with _lock:
            _ip = _ip or found
            return _ip
    return None


def _refresh() -> None:
    global _ip, _refreshing
    try:
        found = _dns_lookup()
        if found:
            with _lock:
                old = _ip
                _ip = found
            if old != found:
                logger.info("DB address refreshed: %s -> %s", old, found)
    finally:
        with _lock:
            _refreshing = False


def start_refresh() -> None:
    """Kick off one background DNS refresh after a failed connection."""
    global _refreshing
    with _lock:
        if _refreshing:
            return
        _refreshing = True
    threading.Thread(target=_refresh, name="qm-db-dns", daemon=True).start()


def note_failure() -> None:
    start_refresh()


def reset_for_tests() -> None:
    global _ip, _refreshing
    with _lock:
        _ip = None
        _refreshing = False
