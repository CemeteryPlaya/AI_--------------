"""
API локальной сводки для пользовательских координат.

Возвращает погодные и экологические показатели:
- погода и AQI из OpenWeatherMap,
- оценка сейсмориска и погодных аномалий (локальные эвристики).
"""

import time
import logging
from typing import Optional

import httpx
from fastapi import APIRouter, Query, HTTPException

from app.config import get_settings

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["Local Stats"])

# ── Простой in-memory кэш (снижает нагрузку на внешний API) ───────────────
_cache: dict[str, tuple[float, dict]] = {}
CACHE_TTL = 300  # 5 minutes


def _cache_key(lat: float, lon: float) -> str:
    return f"{round(lat, 2)}:{round(lon, 2)}"


def _get_cached(key: str) -> Optional[dict]:
    if key in _cache:
        ts, data = _cache[key]
        if time.time() - ts < CACHE_TTL:
            return data
        del _cache[key]
    return None


def _set_cached(key: str, data: dict):
    if len(_cache) > 500:
        cutoff = time.time() - CACHE_TTL
        for k in [k for k, (ts, _) in _cache.items() if ts < cutoff]:
            del _cache[k]
    _cache[key] = (time.time(), data)


# ── Интерпретация AQI OpenWeatherMap ───────────────────────────────────────
def _aqi_info(aqi_index: int) -> dict:
    """OpenWeatherMap AQI index: 1=Good, 2=Fair, 3=Moderate, 4=Poor, 5=Very Poor."""
    mapping = {
        1: {"category": "good", "label": "Хорошее", "numericAqi": 35},
        2: {"category": "moderate", "label": "Умеренное", "numericAqi": 75},
        3: {"category": "unhealthy_sensitive", "label": "Нездоровое для чувств. групп", "numericAqi": 120},
        4: {"category": "unhealthy", "label": "Нездоровое", "numericAqi": 165},
        5: {"category": "hazardous", "label": "Опасное", "numericAqi": 250},
    }
    return mapping.get(aqi_index, mapping[3])


# ── Грубая оценка сейсмического риска по близости к зонам ──────────────────
def _estimate_seismic_risk(lat: float, lon: float) -> dict:
    """
    Упрощенная оценка сейсмориска по расстоянию до известных активных зон.
    Возвращает риск в диапазоне 0.0..1.0 и человекочитаемую метку.
    """
    high_risk_zones = [
        (35, 140, 10),   # Japan
        (38, 23, 8),     # Greece/Turkey
        (28, 85, 8),     # Nepal/Himalaya
        (-8, 110, 8),    # Indonesia
        (37, 15, 6),     # Italy (Etna/Vesuvius)
        (40, 44, 6),     # Caucasus
        (36, -120, 8),   # California
        (19, -99, 6),    # Mexico
        (-33, -71, 6),   # Chile
        (42, 145, 6),    # Kuril Islands
        (56, 160, 5),    # Kamchatka
    ]

    min_dist = 999.0
    for zlat, zlon, radius in high_risk_zones:
        dist = ((lat - zlat) ** 2 + (lon - zlon) ** 2) ** 0.5
        normalized = dist / radius
        if normalized < min_dist:
            min_dist = normalized

    if min_dist < 1:
        risk = max(0.0, 1.0 - min_dist * 0.7)
    elif min_dist < 3:
        risk = max(0.0, 0.3 - (min_dist - 1) * 0.1)
    else:
        risk = max(0.0, 0.1 - (min_dist - 3) * 0.01)

    risk = round(min(risk, 1.0), 2)

    if risk < 0.2:
        label = "Минимальная"
    elif risk < 0.4:
        label = "Низкая"
    elif risk < 0.6:
        label = "Умеренная"
    elif risk < 0.8:
        label = "Высокая"
    else:
        label = "Очень высокая"

    return {"risk": risk, "label": label}


# ── Детерминированные флаги погодных аномалий ──────────────────────────────
def _detect_anomalies(temp: float, humidity: int, wind_speed: float, feels_like: float) -> dict:
    return {
        "heatwave": temp > 35 or feels_like > 38,
        "frost": temp < -15,
        "drought": humidity < 20,
        "strongWind": wind_speed > 15,
        "highHumidity": humidity > 90,
    }


ANOMALY_LABELS = {
    "heatwave": "Жара",
    "frost": "Сильный мороз",
    "drought": "Засуха",
    "strongWind": "Сильный ветер",
    "highHumidity": "Высокая влажность",
}


# ── Main endpoint ───────────────────────────────────────────────────────────
@router.get("/local-stats")
async def get_local_stats(
    lat: float = Query(..., description="User latitude"),
    lon: float = Query(..., description="User longitude"),
):
    """
    Возвращает сводку состояния среды для точки пользователя.

    Использует реальные данные OpenWeatherMap (weather + air_pollution)
    и дополняет их вычисляемыми полями (сейсмика, аномалии).
    """
    settings = get_settings()

    if not settings.openweather_api_key:
        raise HTTPException(
            status_code=503,
            detail="OpenWeatherMap API key not configured. Set OPENWEATHER_API_KEY in .env file.",
        )

    # Возвращаем быстрый ответ, если запись еще не протухла.
    key = _cache_key(lat, lon)
    cached = _get_cached(key)
    if cached:
        return cached

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            # Берем два источника: погода и загрязнение воздуха.
            weather_req = client.get(
                "https://api.openweathermap.org/data/2.5/weather",
                params={
                    "lat": lat,
                    "lon": lon,
                    "appid": settings.openweather_api_key,
                    "units": "metric",
                    "lang": "ru",
                },
            )
            aqi_req = client.get(
                "http://api.openweathermap.org/data/2.5/air_pollution",
                params={
                    "lat": lat,
                    "lon": lon,
                    "appid": settings.openweather_api_key,
                },
            )

            # Корутины создаются заранее, затем выполняются по await.
            weather_resp, aqi_resp = await weather_req, await aqi_req
            weather_resp.raise_for_status()
            aqi_resp.raise_for_status()

            weather = weather_resp.json()
            air = aqi_resp.json()

    except httpx.HTTPStatusError as e:
        logger.error(f"OpenWeatherMap API error: {e.response.status_code}")
        raise HTTPException(status_code=502, detail="Weather API returned an error")
    except httpx.RequestError as e:
        logger.error(f"OpenWeatherMap request failed: {e}")
        raise HTTPException(status_code=502, detail="Could not reach weather API")

    # Нормализация погодных полей.
    main = weather.get("main", {})
    wind = weather.get("wind", {})
    weather_desc = weather.get("weather", [{}])[0]
    temp = main.get("temp", 0)
    feels_like = main.get("feels_like", 0)
    humidity = main.get("humidity", 0)
    pressure = main.get("pressure", 0)
    wind_speed = wind.get("speed", 0)
    wind_gust = wind.get("gust")
    city_name = weather.get("name", "")
    country = weather.get("sys", {}).get("country", "")

    # Нормализация качества воздуха.
    aqi_data = air.get("list", [{}])[0]
    aqi_index = aqi_data.get("main", {}).get("aqi", 3)
    aqi_components = aqi_data.get("components", {})
    aqi_info = _aqi_info(aqi_index)

    # Производные метрики, вычисляемые на нашей стороне.
    seismic = _estimate_seismic_risk(lat, lon)
    anomalies = _detect_anomalies(temp, humidity, wind_speed, feels_like)

    # Контракт ответа для фронтенд-виджета GeoLocationWidget.
    result = {
        # Location
        "city": city_name,
        "country": country,
        "coordinates": {"lat": round(lat, 4), "lng": round(lon, 4)},

        # Weather (real)
        "temperature": round(temp, 1),
        "feelsLike": round(feels_like, 1),
        "humidity": humidity,
        "pressure": pressure,
        "windSpeed": wind_speed,
        "windGust": wind_gust,
        "description": weather_desc.get("description", ""),
        "icon": weather_desc.get("icon", "01d"),
        "iconUrl": f"https://openweathermap.org/img/wn/{weather_desc.get('icon', '01d')}@2x.png",

        # Air quality (real)
        "aqi": aqi_info["numericAqi"],
        "aqiIndex": aqi_index,
        "aqiCategory": aqi_info["category"],
        "aqiLabel": aqi_info["label"],
        "pm25": round(aqi_components.get("pm2_5", 0), 1),
        "pm10": round(aqi_components.get("pm10", 0), 1),
        "co": round(aqi_components.get("co", 0), 1),
        "no2": round(aqi_components.get("no2", 0), 1),

        # Seismic (computed)
        "seismicThreat": seismic["risk"],
        "seismicLabel": seismic["label"],

        # Anomalies
        "weatherAnomalies": anomalies,
        "anomalyLabels": {k: ANOMALY_LABELS[k] for k, v in anomalies.items() if v},
    }

    _set_cached(key, result)
    return result
