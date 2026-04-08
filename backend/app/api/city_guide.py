"""
API "Городской гид" для выбранной точки на карте.

Возвращает:
1) текущую погоду,
2) качество воздуха (AQI + компоненты),
3) практические рекомендации "как одеться / что учесть перед выходом".
"""

import httpx
from fastapi import APIRouter, Query, HTTPException

from app.config import get_settings
from app.services.recommendations import get_clothing_recommendation, get_departure_tips
from app.api.local_stats import _aqi_info

router = APIRouter(prefix="/api", tags=["City Guide"])


@router.get("/city-air-guide")
async def get_city_air_guide(
    lat: float = Query(..., description="Latitude"),
    lon: float = Query(..., description="Longitude")
):
    """
    Сводка по точке (lat/lon), удобная для фронтенд-карточки CityAirGuide.

    Источники:
    - OpenWeatherMap `weather` (погода),
    - OpenWeatherMap `air_pollution` (качество воздуха).
    """
    settings = get_settings()

    if not settings.openweather_api_key:
        raise HTTPException(status_code=503, detail="OpenWeatherMap API key not configured.")

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            # Шаг 1: получаем базовую погоду для координат.
            weather_req = await client.get(
                "https://api.openweathermap.org/data/2.5/weather",
                params={
                    "lat": lat,
                    "lon": lon,
                    "appid": settings.openweather_api_key,
                    "units": "metric",
                    "lang": "ru",
                },
            )
            weather_req.raise_for_status()
            weather = weather_req.json()

            # Шаг 2: получаем загрязнение воздуха для тех же координат.
            aqi_req = await client.get(
                "http://api.openweathermap.org/data/2.5/air_pollution",
                params={
                    "lat": lat,
                    "lon": lon,
                    "appid": settings.openweather_api_key,
                },
            )
            aqi_req.raise_for_status()
            air = aqi_req.json()

    except httpx.HTTPStatusError as e:
        if e.response.status_code == 404:
            raise HTTPException(status_code=404, detail=f"Data for coordinates ({lat}, {lon}) not found.")
        raise HTTPException(status_code=502, detail="Weather API returned an error")
    except httpx.RequestError:
        raise HTTPException(status_code=502, detail="Could not reach weather API")

    # Нормализация погодных полей в плоскую структуру.
    main_weather = weather.get("main", {})
    temp = main_weather.get("temp", 0)
    wind_speed = weather.get("wind", {}).get("speed", 0)
    humidity = main_weather.get("humidity", 0)
    desc = weather.get("weather", [{}])[0].get("description", "")

    # Нормализация качества воздуха.
    aqi_data = air.get("list", [{}])[0]
    aqi_index = aqi_data.get("main", {}).get("aqi", 3)
    aqi_components = aqi_data.get("components", {})
    aqi_info = _aqi_info(aqi_index)

    # Текстовые рекомендации отделены в сервис, чтобы API оставался тонким.
    clothing = get_clothing_recommendation(
        temp=temp,
        wind_speed=wind_speed,
        humidity=humidity,
        aqi_index=aqi_index
    )
    tips = get_departure_tips(
        aqi_index=aqi_index,
        temp=temp,
        description=desc
    )

    # Финальный контракт ответа "как есть" потребляется на фронте без доп. маппинга.
    return {
        "city_resolved": weather.get("name") or "Выбранная точка",
        "coordinates": {"lat": lat, "lon": lon},
        "weather": {
            "temp": round(temp, 1),
            "feels_like": round(main_weather.get("feels_like", 0), 1),
            "humidity": humidity,
            "wind_speed": wind_speed,
            "description": desc,
            "iconUrl": f"https://openweathermap.org/img/wn/{weather.get('weather', [{}])[0].get('icon', '01d')}@2x.png"
        },
        "air_quality": {
            "aqiIndex": aqi_index,
            "aqiLabel": aqi_info["label"],
            "aqiCategory": aqi_info["category"],
            "components": {
                "pm25": round(aqi_components.get("pm2_5", 0), 1),
                "pm10": round(aqi_components.get("pm10", 0), 1),
                "no2": round(aqi_components.get("no2", 0), 1),
                "co": round(aqi_components.get("co", 0), 1),
                "so2": round(aqi_components.get("so2", 0), 1),
                "o3": round(aqi_components.get("o3", 0), 1)
            }
        },
        "recommendations": {
            "clothing": clothing,
            "tips": tips
        }
    }
