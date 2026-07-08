import asyncio
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from app.core.config import settings
from app.core.database import engine
from app.core.limiter import limiter
from sqlalchemy import text
import app.models
from app.routers.users import router as users_router, get_supabase
from app.routers.households import router as households_router
from app.routers.budget import router as budget_router
from app.core.auth import _jwks_client

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    if settings.DEBUG:
        logger.warning("DEBUG mode is enabled — disable before deploying to production")
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

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


# ── Middleware stack (last added = outermost = runs first on request) ─────────

# 1. Catch-all: innermost — catches unhandled exceptions before they escape past
#    CORS, which would cause browsers to report them as CORS errors.
class _CatchAllMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        try:
            return await call_next(request)
        except Exception as exc:
            logger.exception("Unhandled exception on %s %s", request.method, request.url.path)
            return JSONResponse(status_code=500, content={"detail": "Internal server error"})

app.add_middleware(_CatchAllMiddleware)

# 2. CORS: middle layer — sets Access-Control-* headers on every response.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_URL],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)

# 3. Security headers: outermost — added last so it runs last on responses,
#    ensuring headers are present on every reply including error responses.
class _SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["X-XSS-Protection"] = "0"
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        response.headers["Cache-Control"] = "no-store"
        return response

app.add_middleware(_SecurityHeadersMiddleware)

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