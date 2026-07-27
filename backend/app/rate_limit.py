"""Shared slowapi Limiter instance.

Lives in its own module (rather than `app.main`) so routers can
import it at module load time without creating an import cycle:
`app.main` imports the routers; the routers import the limiter.

The rate limiter is disabled when `WORKOUT_APP_TESTING=1` (set by
`tests/conftest.py`) so test runs aren't throttled by their own
per-IP login attempts. Production / dev runs leave it enabled.
"""

from __future__ import annotations

import os

from slowapi import Limiter
from slowapi.util import get_remote_address

_TESTING = os.environ.get("WORKOUT_APP_TESTING") == "1"


def _key_func(request=None):  # type: ignore[no-untyped-def]
    """Per-IP key for production; a constant `"test"` for tests.

    slowapi calls key_func with no args in some internal paths and
    with the Request object in others. We accept both for safety;
    see `slowapi.util.get_remote_address` for the same pattern.
    """
    if _TESTING:
        return "test"
    return get_remote_address(request)


# `enabled=False` short-circuits the limiter when running tests — slowapi
# still creates a bucket per key, but the bucket is never decremented
# past the limit, so the 10/min and 5/hour limits don't fire under
# test load. Production traffic goes through the normal code path.
limiter = Limiter(key_func=_key_func, enabled=not _TESTING)
