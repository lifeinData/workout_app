"""Single source of truth for timestamp formatting.

All routers (and the seed scripts) should import from here so the
on-the-wire timestamp format stays in lockstep across modules.

Format: `YYYY-MM-DDTHH:MM:SSZ` (UTC, 20 chars, no microseconds).
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone


def utc_now_iso() -> str:
    """Return the current UTC time as `YYYY-MM-DDTHH:MM:SSZ`."""
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def utc_today_iso() -> str:
    """Return the current UTC date as `YYYY-MM-DD` (for date-only columns)."""
    return datetime.now(timezone.utc).date().isoformat()


def utc_iso_in_days(days: int) -> str:
    """Return `utc_now_iso() + days` formatted as `YYYY-MM-DDTHH:MM:SSZ`."""
    return (
        datetime.now(timezone.utc) + timedelta(days=days)
    ).strftime("%Y-%m-%dT%H:%M:%SZ")
