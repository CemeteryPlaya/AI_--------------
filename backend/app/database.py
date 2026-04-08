"""Асинхронный SQLAlchemy engine и фабрика сессий для PostGIS."""

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from app.config import get_settings

settings = get_settings()

# Единый engine приложения.
# pool_pre_ping=True помогает заранее обнаруживать "мертвые" соединения.
engine = create_async_engine(
    settings.database_url,
    echo=settings.debug,
    pool_size=20,
    max_overflow=10,
    pool_pre_ping=True,
)

# Фабрика сессий для FastAPI-зависимостей.
async_session = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    """Базовый класс для всех ORM-моделей."""
    pass


async def get_db():
    """
    FastAPI dependency: выдает сессию и завершает транзакцию.

    Правило простое:
    - успех -> commit,
    - ошибка -> rollback.
    """
    async with async_session() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def init_db():
    """Создает PostGIS extension и таблицы при старте приложения (dev-режим)."""
    async with engine.begin() as conn:
        # Гарантируем наличие PostGIS перед созданием таблиц с геометрией.
        await conn.execute(
            __import__("sqlalchemy").text("CREATE EXTENSION IF NOT EXISTS postgis;")
        )
        await conn.run_sync(Base.metadata.create_all)
