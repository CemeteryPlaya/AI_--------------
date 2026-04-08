"""
API временных сравнительных отчетов.

Отчеты здесь демонстрационные: данные генерируются как mock,
а сессии живут в памяти процесса ограниченное время (TTL).
"""

import uuid
import time
import random
import logging
from typing import Optional

from fastapi import APIRouter, Query, HTTPException
from pydantic import BaseModel

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["Reports"])

# ── In-memory хранилище отчетов (TTL: 1 час) ───────────────────────────────
_sessions: dict[str, tuple[float, dict]] = {}
SESSION_TTL = 3600


class PointInput(BaseModel):
    lat: float
    lng: float
    label: Optional[str] = None


class ReportRequest(BaseModel):
    points: list[PointInput]


def _cleanup_sessions():
    """Удаляем протухшие сессии перед чтением/созданием новых."""
    cutoff = time.time() - SESSION_TTL
    expired = [k for k, (ts, _) in _sessions.items() if ts < cutoff]
    for k in expired:
        del _sessions[k]


def _generate_mock_stats():
    """Генерирует псевдореалистичные показатели риска для одной точки."""
    return {
        "aqi": random.randint(15, 200),
        "seismicRisk": random.randint(0, 100),
        "fireRisk": random.randint(0, 100),
        "floodRisk": random.randint(0, 100),
        "volcanicRisk": random.randint(0, 100),
        "waveHeight": round(random.uniform(0, 6), 1),
        "windSpeed": round(random.uniform(0, 30), 1),
        "temperature": random.randint(-20, 45),
        "humidity": random.randint(10, 100),
        "overallRisk": random.randint(0, 100),
    }


def _generate_monthly_data():
    """Формирует 12-месячный временной ряд для графиков отчета."""
    months = ["Янв", "Фев", "Мар", "Апр", "Май", "Июн",
              "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек"]
    return [
        {
            "month": m,
            "temperature": random.randint(-15, 40),
            "precipitation": random.randint(5, 200),
            "aqi": random.randint(20, 180),
        }
        for m in months
    ]


# ── Создание временной сессии отчета ────────────────────────────────────────
@router.post("/report/create")
async def create_report(request: ReportRequest):
    """
    Принимает до 5 точек, генерирует сравнительный отчет
    и возвращает короткий session_id для последующего чтения.
    """
    if len(request.points) == 0:
        raise HTTPException(status_code=400, detail="At least one point is required")
    if len(request.points) > 5:
        raise HTTPException(status_code=400, detail="Maximum 5 points allowed")

    _cleanup_sessions()

    session_id = str(uuid.uuid4())[:12]

    report_data = []
    for idx, point in enumerate(request.points):
        report_data.append({
            "id": f"point-{idx}",
            "lat": point.lat,
            "lng": point.lng,
            "label": point.label or f"Точка {idx + 1}",
            "stats": _generate_mock_stats(),
            "monthlyData": _generate_monthly_data(),
        })

    _sessions[session_id] = (time.time(), {
        "id": session_id,
        "createdAt": time.time(),
        "points": report_data,
    })

    logger.info(f"Report session created: {session_id} ({len(request.points)} points)")

    return {
        "sessionId": session_id,
        "url": f"/report/{session_id}",
        "expiresIn": SESSION_TTL,
    }


# ── Чтение отчета по session_id ─────────────────────────────────────────────
@router.get("/report/{session_id}")
async def get_report(session_id: str):
    """Возвращает ранее созданный отчет или 404, если сессия истекла."""
    _cleanup_sessions()

    if session_id not in _sessions:
        raise HTTPException(status_code=404, detail="Report not found or expired")

    _, data = _sessions[session_id]
    return data
