from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    APP_NAME: str = "Home Pro Manager"
    DEBUG: bool = False
    FRONTEND_URL: str = "http://localhost:3000"

    DATABASE_URL: str
    JWT_SECRET_KEY: str

    class Config:
        env_file = ".env"


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
