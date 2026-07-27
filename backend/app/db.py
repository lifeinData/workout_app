from collections.abc import Generator

from sqlmodel import Session, SQLModel, create_engine

from app.config import get_settings

settings = get_settings()

connect_args = {"check_same_thread": False} if settings.database.url.startswith("sqlite") else {}
engine = create_engine(
    settings.database.url,
    connect_args=connect_args,
    echo=False,
)


def init_db() -> None:
    """Create all tables. Dev-only — production should use Alembic."""
    SQLModel.metadata.create_all(engine)


def get_session() -> Generator[Session, None, None]:
    with Session(engine) as session:
        yield session
