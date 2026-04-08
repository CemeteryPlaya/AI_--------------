"""
Climate Risk Intelligence API — Главный файл приложения FastAPI.

Этот модуль инициализирует сервер FastAPI, регистрирует маршруты (роуты)
и управляет событиями запуска/остановки приложения (lifespan).
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import ORJSONResponse

from app.config import get_settings
from app.database import init_db
from app.api.assets import router as assets_router
from app.api.weather import router as weather_router
from app.api.predict import router as predict_router, load_model_and_scaler
from app.api.report import router as report_router
from app.api.local_stats import router as local_stats_router
from app.api.realtime_layers import router as realtime_layers_router
from app.api.city_guide import router as city_guide_router
from app.api.chat import router as chat_router
from app.services.risk_report import generate_risk_report

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
)
logger = logging.getLogger(__name__)

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """События жизненного цикла приложения — запуск и остановка."""
    logger.info("🚀 Starting Climate Risk Intelligence API...")
    await init_db()
    logger.info("✅ Database initialized with PostGIS extension.")
    load_model_and_scaler()
    logger.info("✅ TinyML model loaded (948 params).")
    yield
    logger.info("🛑 Shutting down Climate Risk Intelligence API.")


app = FastAPI(
    title=settings.app_name,
    description=(
        "Cloud-Native B2B SaaS platform for climate risk intelligence. "
        "Predicts physical climate risks for corporate real estate portfolios "
        "and translates them into financial metrics (Expected Loss, CVaR)."
    ),
    version="0.1.0",
    default_response_class=ORJSONResponse,
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# ── Настройка CORS Middleware (разрешения на кросс-доменные запросы) ──────────
origins = [origin.strip() for origin in settings.cors_origins.split(",")]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Регистрация роутеров (подключение всех API эндпоинтов) ───────────────────
app.include_router(assets_router)
app.include_router(weather_router)
app.include_router(predict_router)
app.include_router(report_router)
app.include_router(local_stats_router)
app.include_router(realtime_layers_router)
app.include_router(city_guide_router)
app.include_router(chat_router)


# ── Проверка работоспособности (Health Check) ────────────────────────────────
@app.get("/health", tags=["System"])
async def health_check():
    return {
        "status": "healthy",
        "service": settings.app_name,
        "version": "0.1.0",
    }


# ── Эндпоинт генерации отчета о рисках ────────────────────────────────────────
@app.post("/api/generate-report", tags=["Risk Analysis"])
async def generate_report(asset_data: dict):
    """
    Сгенерировать отчет о климатических рисках для переданного объекта (актива).

    Принимает данные объекта (локацию, свойства, климатические прогнозы)
    и возвращает анализ финансовых рисков, используя LLM (языковую модель) для перевода в текст.
    """
    report = await generate_risk_report(asset_data)
    return report
