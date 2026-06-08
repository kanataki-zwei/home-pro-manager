from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.core.database import engine
from sqlalchemy import text
import app.models 
from app.routers.users import router as users_router
from app.routers.households import router as households_router
from app.routers.budget import router as budget_router

app = FastAPI(
    title=settings.APP_NAME,
    debug=settings.DEBUG
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
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