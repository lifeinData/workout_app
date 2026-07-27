"""Helpers for parsing the `Authorization: Bearer <token>` header.

Lives outside `app.deps` (which is owned by another agent) and outside
`app.routers.auth` (which is the auth router itself) so the parsing
logic is importable from both. If the data-layer agent later adds
`parse_authorization_header` to `app.deps`, this module can be removed
in a follow-up refactor.

The 48-char cap matches `secrets.token_urlsafe(32)` -> 43 chars, plus
a small margin. It rejects obviously-malformed inputs (e.g. an entire
JWT or a pasted Authorization header) before we hit the DB.
"""

from __future__ import annotations

from fastapi import HTTPException

# Hard upper bound on token length. `secrets.token_urlsafe(32)` produces
# 43 chars; the cap leaves headroom for future algorithms that produce
# slightly longer strings while still rejecting pathologically long
# inputs (which would point at misuse or a probing attack).
_MAX_TOKEN_LEN = 48


def parse_authorization_header(authorization: str) -> str:
    """Parse `Authorization: Bearer <token>` and return the bare token.

    Raises 401 on:
      - missing `bearer ` scheme
      - empty token
      - token longer than `_MAX_TOKEN_LEN`

    Caller is expected to then look the token up in the `sessions`
    table; this function does no DB I/O.
    """
    if not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "Missing or malformed Authorization header")
    token = authorization[7:].strip()
    if not token or len(token) > _MAX_TOKEN_LEN:
        raise HTTPException(401, "Invalid token")
    return token
