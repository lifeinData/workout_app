from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app import __version__
from app.config import get_settings
from app.db import init_db
from app.rate_limit import limiter
from app.routers import (
    auth,
    coach,
    coaching,
    exercises,
    me,
    messages,
    sessions,
    sets,
    workouts,
)
from app.seed import wger_import

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    logger.info("Starting workout backend v%s", __version__)
    init_db()
    if settings.database.seed_on_startup:
        try:
            count = wger_import.seed_if_schema_changed()
            logger.info("Seed: %d exercises in DB", count)
        except Exception as exc:
            logger.warning("Seed skipped: %s", exc)
    yield
    logger.info("Shutting down workout backend")


def create_app() -> FastAPI:
    settings = get_settings()

    app = FastAPI(
        title="Workout App API",
        description="Backend for the React Native workout app",
        version=__version__,
        lifespan=lifespan,
    )

    # Rate limiter state + global exception handler. The /login and
    # /signup endpoints are decorated with `@limiter.limit(...)`;
    # slowapi raises RateLimitExceeded on overflow, which we map to
    # a 429 JSON response with the same shape as our other errors.
    app.state.limiter = limiter

    @app.exception_handler(RateLimitExceeded)
    async def _rate_limit_handler(request: Request, exc: RateLimitExceeded) -> JSONResponse:
        return JSONResponse(
            status_code=429,
            content={"detail": "Too many requests"},
        )

    # SlowAPIMiddleware injects `request.state.view_rate_limit` and
    # enforces limits on routes that opt in via the decorator.
    app.add_middleware(SlowAPIMiddleware)

    # CORS: explicit allowlist of trusted dev origins (localhost,
    # Expo Go) + the dev laptop's LAN IP. The previous broad regex
    # (`192.168.*.*`, `10.*.*.*`) trusted every LAN device, which is
    # wrong on a shared network (e.g. a coffee shop). Add additional
    # trusted IPs to `defaults.yaml: server.cors_origins`.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.server.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(exercises.router, prefix="/api/v1")
    app.include_router(workouts.router, prefix="/api/v1")
    app.include_router(me.router, prefix="/api/v1")
    app.include_router(sessions.router, prefix="/api/v1")
    app.include_router(sets.router, prefix="/api/v1")
    app.include_router(auth.router, prefix="/api/v1")
    app.include_router(coach.router, prefix="/api/v1/coach")
    app.include_router(coaching.router, prefix="/api/v1")
    app.include_router(messages.router, prefix="/api/v1")

    @app.get("/api/v1/health", tags=["health"])
    def health() -> dict:
        return {"status": "ok", "version": __version__}

    return app


app = create_app()
