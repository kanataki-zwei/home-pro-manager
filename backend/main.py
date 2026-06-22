import asyncio
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from app.core.config import settings
from app.core.database import engine
from sqlalchemy import text
import app.models
from app.routers.users import router as users_router, get_supabase
from app.routers.households import router as households_router
from app.routers.budget import router as budget_router
from app.core.auth import _jwks_client

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Pre-warm blocking clients so cold-start latency hits before any request comes in
    await asyncio.to_thread(lambda: _jwks_client.fetch_data())
    await asyncio.to_thread(get_supabase)
    # Pre-warm the DB pool so the first user request doesn't pay connection latency
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
    except Exception as e:
        logger.warning("DB pre-warm failed: %s", e)
    yield


app = FastAPI(
    title=settings.APP_NAME,
    debug=settings.DEBUG,
    lifespan=lifespan,
)

# Order matters: add the catch-all FIRST so it sits INSIDE the CORS layer.
# Unhandled exceptions from route handlers escape Starlette's ExceptionMiddleware
# and propagate up through CORSMiddleware without CORS headers being set, causing
# browsers to report them as CORS errors. This middleware catches those exceptions
# before they reach CORSMiddleware and returns a proper JSON 500 with CORS headers.
class _CatchAllMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        try:
            return await call_next(request)
        except Exception as exc:
            logger.exception("Unhandled exception on %s %s", request.method, request.url.path)
            return JSONResponse(status_code=500, content={"detail": "Internal server error"})

app.add_middleware(_CatchAllMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)

app.include_router(users_router, prefix="/api/users", tags=["Users"])
app.include_router(households_router, prefix="/api/households", tags=["Households"])
app.include_router(budget_router, prefix="/api")

@app.get("/health")
async def health():
    return {"status": "ok", "app": settings.APP_NAME}

@app.get("/health/db")
async def health_db():
    async with engine.connect() as conn:
        result = await conn.execute(text("SELECT version()"))
        version = result.scalar()
        return {"status": "ok", "database": version}