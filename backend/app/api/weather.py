"""
Weather API — проксирует данные от OpenWeatherMap и возвращает GeoJSON
с информацией о температуре для городов вблизи центра видимой области карты.
"""

import time
import logging
from typing import Optional

import httpx
from fastapi import APIRouter, Query, HTTPException

from app.config import get_settings

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["Weather"])

# ── Простой кеш в оперативной памяти (чтобы не превысить лимиты API) ─────────
_cache: dict[str, tuple[float, dict]] = {}
CACHE_TTL = 600  # Время жизни кеша 10 минут


def _cache_key(lat: float, lon: float, zoom: int) -> str:
    # Округляем до 1 знака после запятой, чтобы объединять близкие запросы
    return f"{round(lat, 1)}:{round(lon, 1)}:{zoom}"


def _get_cached(key: str) -> Optional[dict]:
    if key in _cache:
        ts, data = _cache[key]
        if time.time() - ts < CACHE_TTL:
            return data
        del _cache[key]
    return None


def _set_cached(key: str, data: dict):
    # Удаляем старые записи, если размер кеша слишком сильно вырос
    if len(_cache) > 200:
        cutoff = time.time() - CACHE_TTL
        to_del = [k for k, (ts, _) in _cache.items() if ts < cutoff]
        for k in to_del:
            del _cache[k]
    _cache[key] = (time.time(), data)


# ── Helpers ───────────────────────────────────────────────────

_WIND_DIRECTIONS = [
    "С", "ССВ", "СВ", "ВСВ",
    "В", "ВЮВ", "ЮВ", "ЮЮВ",
    "Ю", "ЮЮЗ", "ЮЗ", "ЗЮЗ",
    "З", "ЗСЗ", "СЗ", "ССЗ",
]

_WIND_DIR_FULL = {
    "С": "Северный", "ССВ": "Северо-северо-восточный",
    "СВ": "Северо-восточный", "ВСВ": "Восточно-северо-восточный",
    "В": "Восточный", "ВЮВ": "Восточно-юго-восточный",
    "ЮВ": "Юго-восточный", "ЮЮВ": "Южно-юго-восточный",
    "Ю": "Южный", "ЮЮЗ": "Южно-юго-западный",
    "ЮЗ": "Юго-западный", "ЗЮЗ": "Западно-юго-западный",
    "З": "Западный", "ЗСЗ": "Западно-северо-западный",
    "СЗ": "Северо-западный", "ССЗ": "Северо-северо-западный",
}


def _deg_to_direction(deg: float) -> tuple[str, str]:
    """Конвертация градусов ветра (0-360) в короткие и полные русские названия направлений."""
    idx = round(deg / 22.5) % 16
    short = _WIND_DIRECTIONS[idx]
    return short, _WIND_DIR_FULL[short]


def _temp_to_color(temp_c: float) -> list[int]:
    """Отображение значения температуры на соответствующий RGBA цвет для маркера карты."""
    if temp_c <= -10:
        return [100, 149, 237, 220]     # cold blue
    elif temp_c <= 0:
        return [56, 189, 248, 220]      # sky blue
    elif temp_c <= 10:
        return [52, 211, 153, 220]      # emerald
    elif temp_c <= 20:
        return [250, 204, 21, 220]      # yellow
    elif temp_c <= 30:
        return [251, 146, 60, 220]      # orange
    else:
        return [239, 68, 68, 220]       # red


def _zoom_to_cnt(zoom: int) -> int:
    """Определяет количество городов для запроса в зависимости от уровня масштабирования."""
    if zoom >= 10:
        return 50
    elif zoom >= 7:
        return 30
    elif zoom >= 5:
        return 20
    else:
        return 15


def _weather_icon_url(icon_code: str) -> str:
    return f"https://openweathermap.org/img/wn/{icon_code}@2x.png"


# ── Main endpoint ─────────────────────────────────────────────

@router.get("/weather")
async def get_weather(
    lat: float = Query(..., description="Center latitude of the viewport"),
    lon: float = Query(..., description="Center longitude of the viewport"),
    zoom: int = Query(5, ge=1, le=18, description="Current zoom level"),
):
    """
    Возвращает погодные данные для городов вблизи заданных координат.
    Ответ приходит в формате GeoJSON FeatureCollection со свойствами температуры.
    """
    settings = get_settings()

    if not settings.openweather_api_key:
        raise HTTPException(
            status_code=503,
            detail="OpenWeatherMap API key not configured. "
                   "Set OPENWEATHER_API_KEY in .env file."
        )

    # Check cache
    key = _cache_key(lat, lon, zoom)
    cached = _get_cached(key)
    if cached:
        return cached

    cnt = _zoom_to_cnt(zoom)

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                "https://api.openweathermap.org/data/2.5/find",
                params={
                    "lat": lat,
                    "lon": lon,
                    "cnt": cnt,
                    "appid": settings.openweather_api_key,
                    "units": "metric",
                    "lang": "ru",
                },
            )
            resp.raise_for_status()
            data = resp.json()
    except httpx.HTTPStatusError as e:
        logger.error(f"OpenWeatherMap API error: {e.response.status_code}")
        raise HTTPException(status_code=502, detail="Weather API returned an error")
    except httpx.RequestError as e:
        logger.error(f"OpenWeatherMap request failed: {e}")
        raise HTTPException(status_code=502, detail="Could not reach weather API")

    # Convert to GeoJSON
    features = []
    for city in data.get("list", []):
        coord = city.get("coord", {})
        main = city.get("main", {})
        weather_info = city.get("weather", [{}])[0]
        wind = city.get("wind", {})
        temp_c = main.get("temp", 0)

        wind_deg = wind.get("deg", 0)
        wind_dir_short, wind_dir_full = _deg_to_direction(wind_deg)

        feature = {
            "type": "Feature",
            "geometry": {
                "type": "Point",
                "coordinates": [coord.get("lon", 0), coord.get("lat", 0)],
            },
            "properties": {
                "city": city.get("name", "Unknown"),
                "country": city.get("sys", {}).get("country", ""),
                "temp": round(temp_c, 1),
                "feels_like": round(main.get("feels_like", 0), 1),
                "temp_min": round(main.get("temp_min", 0), 1),
                "temp_max": round(main.get("temp_max", 0), 1),
                "humidity": main.get("humidity", 0),
                "pressure": main.get("pressure", 0),
                "wind_speed": wind.get("speed", 0),
                "wind_gust": wind.get("gust"),
                "wind_deg": wind_deg,
                "wind_direction": wind_dir_short,
                "wind_direction_full": wind_dir_full,
                "description": weather_info.get("description", ""),
                "icon": weather_info.get("icon", "01d"),
                "icon_url": _weather_icon_url(weather_info.get("icon", "01d")),
                "color": _temp_to_color(temp_c),
            },
        }
        features.append(feature)

    geojson = {
        "type": "FeatureCollection",
        "features": features,
    }

    _set_cached(key, geojson)
    return geojson
