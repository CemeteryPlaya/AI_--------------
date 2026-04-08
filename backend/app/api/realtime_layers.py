"""
API слоев данных в реальном времени — проксирование бесплатных публичных API и возврат GeoJSON.

Источники данных (все бесплатны, ключ API не требуется):
- Землетрясения: программа по опасности землетрясений USGS
- Лесные пожары: NASA FIRMS
- Вулканы: NASA EONET
- Ветер: Open-Meteo Weather API
- Волны на океанах: Open-Meteo Marine Weather API
"""

import time
import logging
import math
from typing import Optional

import httpx
from fastapi import APIRouter, Query, HTTPException

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/layers", tags=["Real-time Layers"])

# ── Простой кеш в оперативной памяти ──────────────────────────────────────────
_cache: dict[str, tuple[float, dict]] = {}
CACHE_TTL = 300  # Время жизни 5 минут


def _get_cached(key: str) -> Optional[dict]:
    if key in _cache:
        ts, data = _cache[key]
        if time.time() - ts < CACHE_TTL:
            return data
        del _cache[key]
    return None


def _set_cached(key: str, data: dict):
    if len(_cache) > 100:
        cutoff = time.time() - CACHE_TTL
        to_del = [k for k, (ts, _) in _cache.items() if ts < cutoff]
        for k in to_del:
            del _cache[k]
    _cache[key] = (time.time(), data)


# ═════════════════════════════════════════════════════════════════
# 1. ЗЕМЛЕТРЯСЕНИЯ (заменяет тектонические плиты)
# Источник: Служба геологической съемки США (USGS) — уже возвращает GeoJSON
# ═════════════════════════════════════════════════════════════════

@router.get("/earthquakes")
async def get_earthquakes(
    period: str = Query("day", description="all_hour, all_day, all_week, all_month"),
    min_magnitude: float = Query(2.5, description="Minimum magnitude"),
):
    """Данные о землетрясениях в реальном времени от USGS."""
    cache_key = f"earthquakes:{period}:{min_magnitude}"
    cached = _get_cached(cache_key)
    if cached:
        return cached

    # USGS feed URLs by magnitude threshold
    mag_label = "significant" if min_magnitude >= 6 else "4.5" if min_magnitude >= 4.5 else "2.5" if min_magnitude >= 2.5 else "1.0"
    url = f"https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/{mag_label}_{period}.geojson"

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            data = resp.json()
    except (httpx.HTTPStatusError, httpx.RequestError) as e:
        logger.error(f"USGS earthquake fetch failed: {e}")
        raise HTTPException(status_code=502, detail="Could not fetch earthquake data from USGS")

    # Преобразование к нашему формату - USGS уже возвращает GeoJSON, но мы нормализуем свойства
    features = []
    for f in data.get("features", []):
        props = f.get("properties", {})
        geom = f.get("geometry", {})
        coords = geom.get("coordinates", [0, 0, 0])

        mag = props.get("mag", 0) or 0
        if mag < min_magnitude:
            continue

        # Determine risk level based on magnitude
        if mag >= 7:
            risk = "critical"
            alert_level = "warning"
        elif mag >= 5:
            risk = "high"
            alert_level = "watch"
        elif mag >= 4:
            risk = "medium"
            alert_level = "advisory"
        else:
            risk = "low"
            alert_level = "normal"

        features.append({
            "type": "Feature",
            "geometry": {
                "type": "Point",
                "coordinates": [coords[0], coords[1]],
            },
            "properties": {
                "id": f.get("id", ""),
                "name": props.get("place", "Unknown"),
                "magnitude": round(mag, 1),
                "depth": round(coords[2], 1) if len(coords) > 2 else 0,
                "time": props.get("time", 0),
                "type": props.get("type", "earthquake"),
                "risk": risk,
                "alertLevel": alert_level,
                "tsunami": props.get("tsunami", 0),
                "felt": props.get("felt"),
                "significance": props.get("sig", 0),
                "url": props.get("url", ""),
            },
        })

    result = {"type": "FeatureCollection", "features": features}
    _set_cached(cache_key, result)
    return result


# ═════════════════════════════════════════════════════════════════
# 2. ЛЕСНЫЕ ПОЖАРЫ — NASA FIRMS
# ═════════════════════════════════════════════════════════════════

import csv
import io

@router.get("/wildfires")
async def get_wildfires(
    limit: int = Query(1000, ge=10, le=5000),
):
    """Данные о лесных пожарах в реальном времени от NASA FIRMS (Глобально за 24ч)."""
    cache_key = f"wildfires:global:{limit}"
    cached = _get_cached(cache_key)
    if cached:
        return cached

    url = "https://firms.modaps.eosdis.nasa.gov/data/active_fire/suomi-npp-viirs-c2/csv/SUOMI_VIIRS_C2_Global_24h.csv"

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            text_data = resp.text
    except (httpx.HTTPStatusError, httpx.RequestError) as e:
        logger.error(f"NASA FIRMS fetch failed: {e}")
        raise HTTPException(status_code=502, detail="Could not fetch wildfire data from NASA FIRMS")

    reader = csv.DictReader(io.StringIO(text_data))
    
    parsed_fires = []
    for row in reader:
        try:
            lat = float(row['latitude'])
            lon = float(row['longitude'])
            frp = float(row['frp'])
            confidence = row.get('confidence', 'nominal')
            
            # Skip low confidence fires implicitly labeled 'low'
            if confidence == 'low':
                continue

            # Pixel dimensions in km
            scan = float(row['scan'])
            track = float(row['track'])
            area_sqkm = scan * track

            # Map FRP to 1-100 intensity scale
            intensity = min(100, max(10, (frp / 50.0) * 100))
            
            parsed_fires.append({
                "lat": lat,
                "lon": lon,
                "frp": frp,
                "intensity": round(intensity),
                "area_sqkm": round(area_sqkm, 2),
                "acq_date": row['acq_date'],
                "acq_time": row['acq_time']
            })
        except (ValueError, KeyError):
            continue

    # Sort by Fire Radiative Power (intensity) descending to keep the most significant fires if over limit
    parsed_fires.sort(key=lambda x: x['frp'], reverse=True)
    parsed_fires = parsed_fires[:limit]

    features = []
    for idx, fire in enumerate(parsed_fires):
        features.append({
            "type": "Feature",
            "geometry": {
                "type": "Point",
                "coordinates": [fire['lon'], fire['lat']],
            },
            "properties": {
                "id": f"fire-{idx}",
                "region": f"Fire at {fire['lat']},{fire['lon']}",
                "intensity": fire['intensity'],
                "areaSqKm": fire['area_sqkm'],
                "confidence": 80, # VIIRS nominal/high is generally reliable
                "detectedAt": f"{fire['acq_date']}T{fire['acq_time'][:2]}:{fire['acq_time'][2:]}:00Z",
                "category": (
                    "low" if fire['intensity'] < 25 else
                    "moderate" if fire['intensity'] < 50 else
                    "high" if fire['intensity'] < 75 else "extreme"
                ),
                "source": "NASA FIRMS",
                "label": f"FRP: {fire['frp']} MW",
            },
        })

    result = {"type": "FeatureCollection", "features": features}
    _set_cached(cache_key, result)
    return result


# ═════════════════════════════════════════════════════════════════
# 3. ВУЛКАНИЧЕСКАЯ АКТИВНОСТЬ — NASA EONET
# ═════════════════════════════════════════════════════════════════

@router.get("/volcanoes")
async def get_volcanoes(
    days: int = Query(365, ge=1, le=730, description="Look back N days"),
    limit: int = Query(100, ge=10, le=300),
):
    """Вулканическая активность в реальном времени от NASA EONET."""
    cache_key = f"volcanoes:{days}:{limit}"
    cached = _get_cached(cache_key)
    if cached:
        return cached

    url = "https://eonet.gsfc.nasa.gov/api/v3/events"
    params = {
        "category": "volcanoes",
        "days": days,
        "limit": limit,
    }

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.get(url, params=params)
            resp.raise_for_status()
            data = resp.json()
    except (httpx.HTTPStatusError, httpx.RequestError) as e:
        logger.error(f"NASA EONET volcanoes fetch failed: {e}")
        raise HTTPException(status_code=502, detail="Could not fetch volcano data from NASA EONET")

    features = []
    for event in data.get("events", []):
        geometries = event.get("geometry", [])
        if not geometries:
            continue

        latest = geometries[-1]
        coords = latest.get("coordinates", [0, 0])
        title = event.get("title", "Unknown Volcano")

        # Determine alert level from status
        is_closed = event.get("closed") is not None
        sources_count = len(event.get("sources", []))
        geom_count = len(geometries)

        if is_closed:
            alert_level = "normal"
        elif geom_count > 10:
            alert_level = "warning"
        elif geom_count > 5:
            alert_level = "watch"
        elif sources_count > 2:
            alert_level = "advisory"
        else:
            alert_level = "normal"

        # Estimate impact radius from activity level
        impact_radius = {
            "normal": 10,
            "advisory": 20,
            "watch": 35,
            "warning": 50,
        }.get(alert_level, 10)

        features.append({
            "type": "Feature",
            "geometry": {
                "type": "Point",
                "coordinates": coords,
            },
            "properties": {
                "id": event.get("id", ""),
                "name": title,
                "country": "",
                "alertLevel": alert_level,
                "impactRadiusKm": impact_radius,
                "seismicEvents24h": geom_count,
                "lastEvent": latest.get("date", ""),
                "source": "NASA EONET",
                "label": title,
            },
        })

    result = {"type": "FeatureCollection", "features": features}
    _set_cached(cache_key, result)
    return result


# ═════════════════════════════════════════════════════════════════
# 4. ВЕТЕР — Open-Meteo Weather API (на основе сетки)
# ═════════════════════════════════════════════════════════════════

@router.get("/wind")
async def get_wind(
    lat: float = Query(41.0, description="Center latitude"),
    lon: float = Query(69.0, description="Center longitude"),
    zoom: int = Query(5, ge=2, le=15),
):
    """Сетка данных ветра от API Open-Meteo."""
    cache_key = f"wind:{round(lat)}:{round(lon)}:{zoom}"
    cached = _get_cached(cache_key)
    if cached:
        return cached

    # Generate grid of points based on zoom
    step = max(2, 20 - zoom * 2)  # degrees between points
    half_range = step * 4

    latitudes = []
    longitudes = []
    for la in _frange(lat - half_range, lat + half_range, step):
        for lo in _frange(lon - half_range, lon + half_range, step):
            if -90 <= la <= 90 and -180 <= lo <= 180:
                latitudes.append(round(la, 2))
                longitudes.append(round(lo, 2))

    if not latitudes:
        return {"type": "FeatureCollection", "features": []}

    # Open-Meteo supports multiple locations
    lat_str = ",".join(str(x) for x in latitudes[:50])
    lon_str = ",".join(str(x) for x in longitudes[:50])

    url = "https://api.open-meteo.com/v1/forecast"
    params = {
        "latitude": lat_str,
        "longitude": lon_str,
        "current": "wind_speed_10m,wind_direction_10m,wind_gusts_10m",
        "timezone": "auto",
    }

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(url, params=params)
            resp.raise_for_status()
            data = resp.json()
    except (httpx.HTTPStatusError, httpx.RequestError) as e:
        logger.error(f"Open-Meteo wind fetch failed: {e}")
        raise HTTPException(status_code=502, detail="Could not fetch wind data from Open-Meteo")

    features = []

    # Open-Meteo returns array for multiple locations or single object
    results = data if isinstance(data, list) else [data]

    for item in results:
        current = item.get("current", {})
        item_lat = item.get("latitude", 0)
        item_lon = item.get("longitude", 0)

        speed = current.get("wind_speed_10m", 0) or 0
        direction = current.get("wind_direction_10m", 0) or 0
        gust = current.get("wind_gusts_10m", 0) or 0

        # Convert km/h to m/s
        speed_ms = round(speed / 3.6, 1)
        gust_ms = round(gust / 3.6, 1)

        category = (
            "calm" if speed_ms < 5 else
            "moderate" if speed_ms < 12 else
            "strong" if speed_ms < 20 else "storm"
        )

        features.append({
            "type": "Feature",
            "geometry": {
                "type": "Point",
                "coordinates": [item_lon, item_lat],
            },
            "properties": {
                "id": f"wind-{item_lat}-{item_lon}",
                "speed": speed_ms,
                "direction": round(direction),
                "gust": gust_ms,
                "category": category,
                "label": f"{speed_ms} м/с",
            },
        })

    result = {"type": "FeatureCollection", "features": features}
    _set_cached(cache_key, result)
    return result


# ═════════════════════════════════════════════════════════════════
# 5. ВОЛНЫ — Open-Meteo Marine API
# ═════════════════════════════════════════════════════════════════

@router.get("/waves")
async def get_waves(
    lat: float = Query(30.0, description="Center latitude"),
    lon: float = Query(0.0, description="Center longitude"),
    zoom: int = Query(5, ge=2, le=15),
):
    """Данные высоты океанических волн от API Open-Meteo Marine."""
    cache_key = f"waves:{round(lat)}:{round(lon)}:{zoom}"
    cached = _get_cached(cache_key)
    if cached:
        return cached

    # Generate ocean grid points
    step = max(3, 20 - zoom * 2)
    half_range = step * 4

    latitudes = []
    longitudes = []
    for la in _frange(lat - half_range, lat + half_range, step):
        for lo in _frange(lon - half_range, lon + half_range, step):
            if -90 <= la <= 90 and -180 <= lo <= 180:
                latitudes.append(round(la, 2))
                longitudes.append(round(lo, 2))

    if not latitudes:
        return {"type": "FeatureCollection", "features": []}

    lat_str = ",".join(str(x) for x in latitudes[:50])
    lon_str = ",".join(str(x) for x in longitudes[:50])

    url = "https://marine-api.open-meteo.com/v1/marine"
    params = {
        "latitude": lat_str,
        "longitude": lon_str,
        "current": "wave_height,wave_period,wave_direction",
        "timezone": "auto",
    }

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(url, params=params)
            resp.raise_for_status()
            data = resp.json()
    except (httpx.HTTPStatusError, httpx.RequestError) as e:
        logger.error(f"Open-Meteo marine fetch failed: {e}")
        raise HTTPException(status_code=502, detail="Could not fetch wave data from Open-Meteo")

    features = []
    results = data if isinstance(data, list) else [data]

    for item in results:
        current = item.get("current", {})
        item_lat = item.get("latitude", 0)
        item_lon = item.get("longitude", 0)

        height = current.get("wave_height") or 0
        period = current.get("wave_period") or 0

        # Skip land points (Open-Meteo returns null/0 for land)
        if height == 0 and period == 0:
            continue

        category = (
            "calm" if height < 1 else
            "moderate" if height < 2.5 else
            "rough" if height < 4 else
            "very_rough" if height < 6 else "extreme"
        )

        features.append({
            "type": "Feature",
            "geometry": {
                "type": "Point",
                "coordinates": [item_lon, item_lat],
            },
            "properties": {
                "id": f"wave-{item_lat}-{item_lon}",
                "region": f"{item_lat}°, {item_lon}°",
                "height": round(height, 1),
                "period": round(period, 1),
                "category": category,
                "label": f"{round(height, 1)} м",
            },
        })

    result = {"type": "FeatureCollection", "features": features}
    _set_cached(cache_key, result)
    return result


# ── Utility ──────────────────────────────────────────────────────

def _frange(start: float, stop: float, step: float):
    """Float range generator."""
    val = start
    while val <= stop:
        yield val
        val += step
