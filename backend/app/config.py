"""Application configuration via environment variables."""

from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    """Global application settings loaded from environment."""

    # Database
    database_url: str = "postgresql+asyncpg://climate_user:climate_secret_2026@db:5432/climate_risk_db"
    database_url_sync: str = "postgresql://climate_user:climate_secret_2026@db:5432/climate_risk_db"

    # S3 / MinIO
    s3_endpoint: str = "http://minio:9000"
    s3_access_key: str = "minioadmin"
    s3_secret_key: str = "miniosecret2026"
    s3_bucket_name: str = "climate-data"

    # Weather API
    openweather_api_key: str = ""

    # CORS
    cors_origins: str = "http://localhost:3000"

    # OpenWeatherMap
    openweather_api_key: str = ""

    # App
    app_name: str = "Climate Risk Intelligence API"
    debug: bool = True

    class Config:
        env_file = ".env"
        case_sensitive = False


@lru_cache()
def get_settings() -> Settings:
    return Settings()
