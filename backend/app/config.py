"""Pydantic-Settings configuration with YAML + env layering (12-factor).

Layering (highest priority first):
  1. Environment variables — e.g. `DATABASE__URL=...` overrides YAML.
  2. `config/local.yaml` — gitignored, for developer-only overrides.
  3. `config/defaults.yaml` — committed defaults.

Usage:
    from app.config import get_settings
    settings = get_settings()
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Any

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict, YamlConfigSettingsSource

BACKEND_DIR = Path(__file__).resolve().parent.parent
CONFIG_DIR = BACKEND_DIR / "config"
DEFAULTS_YAML = CONFIG_DIR / "defaults.yaml"
LOCAL_YAML = CONFIG_DIR / "local.yaml"


class AppConfig(BaseSettings):
    name: str = "workout_app"
    version: str = "0.2.0"
    schema_version: int = 1


class AuthConfig(BaseSettings):
    session_ttl_days: int = 30
    bcrypt_cost: int = 12
    username_regex: str = r"^[a-z0-9_]{3,32}$"
    password_min_length: int = 8


class DatabaseConfig(BaseSettings):
    # Resolved at config-load time to an absolute path so it's invariant to cwd.
    # Override via DATABASE__URL env var (env_nested_delimiter="__").
    path_template: str = f"sqlite:///{BACKEND_DIR / 'workout.db'}"
    seed_on_startup: bool = True
    pool_size: int = 1
    connect_args: dict[str, Any] = Field(default_factory=lambda: {"check_same_thread": False})

    @property
    def url(self) -> str:
        """Resolve path_template with {backend_dir} substituted."""
        return self.path_template.replace("{backend_dir}", str(BACKEND_DIR))


class ServerConfig(BaseSettings):
    host: str = "0.0.0.0"
    port: int = 8000
    log_level: str = "info"
    cors_origins: list[str] = Field(default_factory=list)


class SeedUser(BaseSettings):
    username: str
    password: str
    role: str = "user"
    display_name: str | None = None
    initials: str | None = None


class SeedCoachLink(BaseSettings):
    coach: str  # username
    athlete: str  # username


class SeedWelcomeMessage(BaseSettings):
    # `from` is a Python keyword, so accept it via the alias.
    model_config = SettingsConfigDict(populate_by_name=True)

    from_user: str = Field(alias="from")
    to: str
    body: str


class SeedCoaching(BaseSettings):
    default_workout_creator: str | None = None  # username
    links: list[SeedCoachLink] = Field(default_factory=list)  # seeded as accepted
    assign_all_seed_workouts: bool = False
    welcome_messages: list[SeedWelcomeMessage] = Field(default_factory=list)


class SeedConfig(BaseSettings):
    default_workout_ids: list[str] = Field(default_factory=list)
    initial_users: list[SeedUser] = Field(default_factory=list)
    coaching: SeedCoaching = Field(default_factory=SeedCoaching)


class Settings(BaseSettings):
    """Top-level settings. Pydantic-Settings merges YAML + env automatically."""

    app: AppConfig = Field(default_factory=AppConfig)
    auth: AuthConfig = Field(default_factory=AuthConfig)
    database: DatabaseConfig = Field(default_factory=DatabaseConfig)
    server: ServerConfig = Field(default_factory=ServerConfig)
    seed: SeedConfig = Field(default_factory=SeedConfig)

    model_config = SettingsConfigDict(
        env_nested_delimiter="__",
        env_file=None,
        extra="ignore",
    )

    @classmethod
    def settings_customise_sources(
        cls,
        settings_cls: type[BaseSettings],
        init_settings: Any,
        env_settings: Any,
        dotenv_settings: Any,
        file_secret_settings: Any,
    ) -> tuple[Any, ...]:
        """Add YAML config sources layered behind env vars (12-factor)."""
        sources: list[Any] = [init_settings, env_settings]
        if DEFAULTS_YAML.is_file():
            sources.append(YamlConfigSettingsSource(settings_cls, yaml_file=str(DEFAULTS_YAML)))
        if LOCAL_YAML.is_file():
            sources.append(YamlConfigSettingsSource(settings_cls, yaml_file=str(LOCAL_YAML)))
        sources.append(file_secret_settings)
        return tuple(sources)


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
