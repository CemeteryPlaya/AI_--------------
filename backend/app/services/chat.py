"""
Climate Intel AI — сервис чата.

Агрегирует данные из всех внешних источников (OpenWeatherMap, USGS, NASA FIRMS,
NASA EONET, Open-Meteo) параллельно, строит JSON-контекст для системного промпта
и выполняет вызов Anthropic API.
"""

import asyncio
import csv
import io
import json
import logging
import math
from pathlib import Path
from typing import Any

import httpx
import google.generativeai as genai

from app.config import get_settings
from app.api.local_stats import _aqi_info, _estimate_seismic_risk

logger = logging.getLogger(__name__)

# ── Системный промпт ──────────────────────────────────────────────────────────
_PROMPT_PATH = Path(__file__).parent.parent / "prompts" / "climate_intel_ai.txt"
SYSTEM_PROMPT = _PROMPT_PATH.read_text(encoding="utf-8") if _PROMPT_PATH.exists() else ""

# Радиус поиска событий (землетрясения, пожары, вулканы) вокруг точки пользователя
RADIUS_KM = 150


# ── Геодезия ──────────────────────────────────────────────────────────────────

def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Расстояние по большой окружности между двумя точками (км)."""
    R = 6371.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = (
        math.sin(dphi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    )
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


# ── Источники данных ──────────────────────────────────────────────────────────

async def _fetch_weather_aqi(lat: float, lon: float, api_key: str) -> dict:
    """Погода + AQI из OpenWeatherMap."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            weather_resp = await client.get(
                "https://api.openweathermap.org/data/2.5/weather",
                params={
                    "lat": lat, "lon": lon,
                    "appid": api_key, "units": "metric", "lang": "ru",
                },
            )
            aqi_resp = await client.get(
                "http://api.openweathermap.org/data/2.5/air_pollution",
                params={"lat": lat, "lon": lon, "appid": api_key},
            )
            weather_resp.raise_for_status()
            aqi_resp.raise_for_status()
            weather = weather_resp.json()
            air = aqi_resp.json()
    except Exception as exc:
        logger.warning("Weather/AQI fetch failed: %s", exc)
        return {}

    main = weather.get("main", {})
    wind = weather.get("wind", {})
    w_desc = weather.get("weather", [{}])[0]
    aqi_data = air.get("list", [{}])[0]
    aqi_index = aqi_data.get("main", {}).get("aqi", 3)
    aqi_comps = aqi_data.get("components", {})
    aqi_info = _aqi_info(aqi_index)

    return {
        "city": weather.get("name", ""),
        "country": weather.get("sys", {}).get("country", ""),
        "temperature_c": round(main.get("temp", 0), 1),
        "feels_like_c": round(main.get("feels_like", 0), 1),
        "humidity_pct": main.get("humidity", 0),
        "pressure_hpa": main.get("pressure", 0),
        "wind_speed_ms": round(wind.get("speed", 0), 1),
        "wind_gust_ms": round(wind.get("gust", 0), 1) if wind.get("gust") else None,
        "description": w_desc.get("description", ""),
        "aqi_index": aqi_index,           # 1..5 (OWM scale)
        "aqi_label": aqi_info["label"],
        "aqi_category": aqi_info["category"],
        "aqi_numeric": aqi_info["numericAqi"],
        "pm25": round(aqi_comps.get("pm2_5", 0), 1),
        "pm10": round(aqi_comps.get("pm10", 0), 1),
        "no2": round(aqi_comps.get("no2", 0), 1),
        "co": round(aqi_comps.get("co", 0), 1),
    }


async def _fetch_earthquakes(lat: float, lon: float) -> list[dict]:
    """Землетрясения за 24 ч (USGS), отфильтрованные по радиусу."""
    url = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson"
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            data = resp.json()
    except Exception as exc:
        logger.warning("USGS earthquakes fetch failed: %s", exc)
        return []

    nearby: list[dict] = []
    for feature in data.get("features", []):
        coords = feature.get("geometry", {}).get("coordinates", [0, 0, 0])
        dist = _haversine_km(lat, lon, coords[1], coords[0])
        if dist > RADIUS_KM:
            continue
        props = feature.get("properties", {})
        mag = round(props.get("mag", 0) or 0, 1)
        nearby.append({
            "place": props.get("place", "Unknown"),
            "magnitude": mag,
            "depth_km": round(coords[2], 1) if len(coords) > 2 else 0,
            "distance_km": round(dist),
            "tsunami_flag": bool(props.get("tsunami", 0)),
            "time_utc": props.get("time"),
        })

    nearby.sort(key=lambda x: x["magnitude"], reverse=True)
    return nearby[:5]


async def _fetch_wildfires(lat: float, lon: float) -> list[dict]:
    """Активные очаги пожаров за 24 ч (NASA FIRMS VIIRS), отфильтрованные по радиусу."""
    url = (
        "https://firms.modaps.eosdis.nasa.gov/data/active_fire/"
        "suomi-npp-viirs-c2/csv/SUOMI_VIIRS_C2_Global_24h.csv"
    )
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            text_data = resp.text
    except Exception as exc:
        logger.warning("NASA FIRMS fetch failed: %s", exc)
        return []

    nearby: list[dict] = []
    reader = csv.DictReader(io.StringIO(text_data))
    for row in reader:
        try:
            fire_lat = float(row["latitude"])
            fire_lon = float(row["longitude"])
            confidence = row.get("confidence", "nominal")
            if confidence == "low":
                continue
            dist = _haversine_km(lat, lon, fire_lat, fire_lon)
            if dist > RADIUS_KM:
                continue
            frp = float(row["frp"])
            intensity = round(min(100, max(10, (frp / 50.0) * 100)))
            nearby.append({
                "distance_km": round(dist),
                "frp_mw": round(frp, 1),
                "intensity": intensity,
                "category": (
                    "low" if intensity < 25 else
                    "moderate" if intensity < 50 else
                    "high" if intensity < 75 else "extreme"
                ),
                "detected_at": f"{row['acq_date']} {row['acq_time']}Z",
                "confidence": confidence,
            })
        except (ValueError, KeyError):
            continue

    nearby.sort(key=lambda x: x["frp_mw"], reverse=True)
    return nearby[:5]


async def _fetch_volcanoes(lat: float, lon: float) -> list[dict]:
    """Активные вулканы за 30 дней (NASA EONET), отфильтрованные по радиусу."""
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.get(
                "https://eonet.gsfc.nasa.gov/api/v3/events",
                params={"category": "volcanoes", "days": 30, "limit": 100},
            )
            resp.raise_for_status()
            data = resp.json()
    except Exception as exc:
        logger.warning("NASA EONET volcanoes fetch failed: %s", exc)
        return []

    nearby: list[dict] = []
    for event in data.get("events", []):
        geometries = event.get("geometry", [])
        if not geometries:
            continue
        latest = geometries[-1]
        coords = latest.get("coordinates", [0, 0])
        dist = _haversine_km(lat, lon, coords[1], coords[0])
        if dist > RADIUS_KM:
            continue
        nearby.append({
            "name": event.get("title", "Unknown"),
            "distance_km": round(dist),
            "last_event_date": latest.get("date", ""),
            "still_active": event.get("closed") is None,
        })

    return nearby[:3]


async def _fetch_wind(lat: float, lon: float) -> dict:
    """Ветер в точке пользователя (Open-Meteo)."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                "https://api.open-meteo.com/v1/forecast",
                params={
                    "latitude": lat,
                    "longitude": lon,
                    "current": "wind_speed_10m,wind_direction_10m,wind_gusts_10m",
                    "timezone": "auto",
                },
            )
            resp.raise_for_status()
            data = resp.json()
    except Exception as exc:
        logger.warning("Open-Meteo wind fetch failed: %s", exc)
        return {}

    current = data.get("current", {})
    speed_kmh = current.get("wind_speed_10m", 0) or 0
    gust_kmh = current.get("wind_gusts_10m", 0) or 0
    return {
        "speed_ms": round(speed_kmh / 3.6, 1),
        "gust_ms": round(gust_kmh / 3.6, 1),
        "direction_deg": round(current.get("wind_direction_10m", 0) or 0),
    }


# ── ML-оценки рисков (эвристическая модель) ───────────────────────────────────

def _compute_risk_scores(weather: dict, wind: dict, seismic: dict) -> dict:
    """
    Вычисляет индексы риска на основе живых метеоданных.
    Три индикатора: пожарный риск, паводковый риск, тепловой стресс.
    """
    temp = weather.get("temperature_c", 20)
    humidity = weather.get("humidity_pct", 50)
    wind_ms = wind.get("speed_ms", 0)
    aqi_index = weather.get("aqi_index", 1)

    # Пожарный риск: высокая температура + низкая влажность + сильный ветер
    if temp > 35 and humidity < 30 and wind_ms > 10:
        fire_score = 0.9
    elif temp > 30 and humidity < 40:
        fire_score = 0.6
    elif temp > 25 and humidity < 50:
        fire_score = 0.3
    else:
        fire_score = 0.1
    fire_score = round(min(1.0, fire_score), 2)

    # Паводковый риск: упрощённый прокси на основе влажности
    if humidity > 90:
        flood_score = 0.7
    elif humidity > 75:
        flood_score = 0.4
    else:
        flood_score = round(max(0.0, (humidity - 60) / 100), 2)

    # Тепловой стресс
    if temp > 40 or (temp > 35 and humidity > 60):
        heat = "extreme"
    elif temp > 35:
        heat = "high"
    elif temp > 30:
        heat = "moderate"
    else:
        heat = "none"

    def _label(score: float) -> str:
        if score >= 0.8:
            return "extreme"
        if score >= 0.5:
            return "high"
        if score >= 0.2:
            return "moderate"
        return "low"

    return {
        "fire_risk_score": fire_score,
        "fire_risk_label": _label(fire_score),
        "flood_risk_score": round(flood_score, 2),
        "flood_risk_label": _label(flood_score),
        "heat_stress": heat,
        "seismic_risk_score": seismic.get("risk", 0.0),
        "seismic_risk_label": seismic.get("label", "Минимальная"),
        "air_quality_risk": (
            "poor" if aqi_index >= 4 else
            "moderate" if aqi_index == 3 else
            "good"
        ),
    }


# ── Построение сообщения пользователя (data payload) ─────────────────────────

def _build_user_message(
    lat: float,
    lon: float,
    weather: dict,
    earthquakes: list[dict],
    wildfires: list[dict],
    volcanoes: list[dict],
    wind: dict,
    risk_scores: dict,
    chat_history: list[dict],
    query: str,
) -> str:
    location_data = {
        "coordinates": {"lat": lat, "lon": lon},
        "city": weather.get("city", "Unknown"),
        "country": weather.get("country", "Unknown"),
        "search_radius_km": RADIUS_KM,
    }

    realtime_risk_data = {
        "weather_and_aqi": weather,
        "wind": wind,
        "nearby_earthquakes_24h": earthquakes,
        "nearby_wildfires_24h": wildfires,
        "nearby_active_volcanoes_30d": volcanoes,
    }

    ml_predictions = {
        "risk_scores": risk_scores,
        "model_note": (
            "Fire/flood/heat scores are computed by an internal heuristic model "
            "based on live weather inputs. Seismic risk is based on proximity "
            "to known active zones."
        ),
    }

    # Оставляем не более 6 последних сообщений (3 хода), чтобы не раздувать контекст
    history_lines: list[str] = []
    for msg in chat_history[-6:]:
        role_label = "Пользователь" if msg.get("role") == "user" else "Climate Intel AI"
        history_lines.append(f"{role_label}: {msg.get('content', '')}")
    history_text = "\n".join(history_lines) if history_lines else "(Начало диалога)"

    return (
        "=== ДАННЫЕ О МЕСТОПОЛОЖЕНИИ ===\n"
        f"```json\n{json.dumps(location_data, ensure_ascii=False, indent=2)}\n```\n\n"
        "=== ДАННЫЕ В РЕАЛЬНОМ ВРЕМЕНИ ===\n"
        f"```json\n{json.dumps(realtime_risk_data, ensure_ascii=False, indent=2)}\n```\n\n"
        "=== ML-ПРОГНОЗЫ РИСКОВ ===\n"
        f"```json\n{json.dumps(ml_predictions, ensure_ascii=False, indent=2)}\n```\n\n"
        "=== ИСТОРИЯ ДИАЛОГА ===\n"
        f"{history_text}\n\n"
        f"Пользователь спрашивает: {query}\n"
        "Ответь в соответствии с правилами выше."
    )


# ── Точка входа сервиса ───────────────────────────────────────────────────────

async def run_chat(
    lat: float,
    lon: float,
    query: str,
    chat_history: list[dict],
) -> dict[str, Any]:
    """
    Агрегирует все источники данных параллельно, строит контекст
    и вызывает Gemini (Google Generative AI).

    Возвращает:
    - status: "ok" | "stub"
    - reply: текст ответа Gemini (при status="ok")
    - context_summary: краткая статистика собранных данных
    """
    settings = get_settings()

    # Параллельный запрос всех внешних источников
    weather, earthquakes, wildfires, volcanoes, wind = await asyncio.gather(
        _fetch_weather_aqi(lat, lon, settings.openweather_api_key),
        _fetch_earthquakes(lat, lon),
        _fetch_wildfires(lat, lon),
        _fetch_volcanoes(lat, lon),
        _fetch_wind(lat, lon),
        return_exceptions=False,
    )

    seismic = _estimate_seismic_risk(lat, lon)
    risk_scores = _compute_risk_scores(weather, wind, seismic)

    user_message = _build_user_message(
        lat=lat, lon=lon,
        weather=weather,
        earthquakes=earthquakes,
        wildfires=wildfires,
        volcanoes=volcanoes,
        wind=wind,
        risk_scores=risk_scores,
        chat_history=chat_history,
        query=query,
    )

    context_summary = {
        "city": weather.get("city", ""),
        "earthquakes_nearby": len(earthquakes),
        "wildfires_nearby": len(wildfires),
        "volcanoes_nearby": len(volcanoes),
        "risk_scores": risk_scores,
    }

    if not settings.gemini_api_key:
        return {
            "status": "stub",
            "message": (
                "GEMINI_API_KEY not configured. "
                "Add it to your .env file to enable AI responses."
            ),
            "context_summary": context_summary,
        }

    genai.configure(api_key=settings.gemini_api_key)
    model = genai.GenerativeModel(
        model_name="gemini-1.5-flash",
        system_instruction=SYSTEM_PROMPT,
    )
    response = await model.generate_content_async(
        contents=user_message,
        generation_config=genai.GenerationConfig(
            temperature=0.3,
            max_output_tokens=2048,
        ),
    )

    usage = response.usage_metadata
    return {
        "status": "ok",
        "reply": response.text,
        "usage": {
            "input_tokens": usage.prompt_token_count,
            "output_tokens": usage.candidates_token_count,
        },
        "context_summary": context_summary,
    }
