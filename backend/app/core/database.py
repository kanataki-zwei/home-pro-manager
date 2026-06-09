from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from app.core.config import settings

engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.DEBUG,
    pool_recycle=240,   # recycle before PgBouncer's idle timeout (~300s)
    connect_args={
        "prepared_statement_cache_size": 0,
        # Use unnamed prepared statements so PgBouncer transaction mode
        # doesn't collide when it reuses a backend connection for a new
        # asyncpg connection object (both would generate __asyncpg_stmt_0__).
        # name="" tells PostgreSQL to use an unnamed statement, which is
        # discarded automatically after each Execute.
        "prepared_statement_name_func": lambda: "",
    },
)

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False
)

class Base(DeclarativeBase):
    pass

async def get_db() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()