"use client";

import { useState, useCallback, useEffect } from "react";
import { useAppState } from "@/lib/store";
import { useI18n } from "@/lib/i18n";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

function AqiBadge({ category, label }) {
  const clsMap = {
    good: "badge-success",
    moderate: "badge-warning",
    unhealthy_sensitive: "badge-error",
    unhealthy: "badge-error",
    hazardous: "badge-error",
  };
  return <span className={`badge ${clsMap[category] || "badge-warning"}`}>{label}</span>;
}

export default function CityAirGuide() {
  const { activePin } = useAppState();
  const { lang } = useI18n();
  const isRu = lang === "ru";

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchCityData = useCallback(async (lat, lon) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/city-air-guide?lat=${lat}&lon=${lon}`);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || `HTTP ${res.status}`);
      }
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError(err.message);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activePin) {
      fetchCityData(activePin.lat, activePin.lng);
    } else {
      setData(null);
      setError(null);
    }
  }, [activePin, fetchCityData]);

  const title = isRu ? "Городской гид (Погода и Воздух)" : "City Guide (Weather & Air)";

  if (!activePin && !data && !loading && !error) {
    return (
      <div className="glass-card">
        <div className="glass-card-title">
          <span className="icon">🏙️</span>
          {title}
        </div>
        <div
          style={{
            textAlign: "center",
            padding: "16px 8px",
            color: "var(--text-muted)",
            fontSize: 13,
          }}
        >
          {isRu
            ? "Кликните на карту, чтобы выбрать точку и рассчитать качество воздуха, советы и погоду."
            : "Click on the map to select a point and get weather, air quality and daily advice."}
        </div>
      </div>
    );
  }

  return (
    <div className="glass-card">
      <div className="glass-card-title">
        <span className="icon">🏙️</span>
        {title}
      </div>

      {loading && (
        <div style={{ textAlign: "center", padding: 16, color: "var(--text-muted)" }}>
          <div className="spinner" style={{ margin: "0 auto 8px" }} />
          <div style={{ fontSize: 11 }}>
            {isRu
              ? "Сбор данных с сенсоров для выбранной точки..."
              : "Collecting sensor data for the selected point..."}
          </div>
        </div>
      )}

      {error && !loading && (
        <div className="geo-error">
          <div className="geo-error-text">
            {isRu ? "Ошибка" : "Error"}: {error}
          </div>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => fetchCityData(activePin.lat, activePin.lng)}
            style={{ marginTop: 6 }}
          >
            {isRu ? "Повторить" : "Retry"}
          </button>
        </div>
      )}

      {data && !loading && (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: "18px", fontWeight: "600", color: "var(--text-main)" }}>
                {data.city_resolved}
              </div>
              {data.weather.description && (
                <div
                  style={{
                    fontSize: "13px",
                    color: "var(--text-muted)",
                    textTransform: "capitalize",
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                  }}
                >
                  <img src={data.weather.iconUrl} alt="icon" style={{ width: 20, height: 20 }} />
                  {data.weather.description}
                </div>
              )}
            </div>

            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: "20px", fontWeight: "bold", color: "var(--text-main)" }}>
                {data.weather.temp}°C
              </div>
              <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                {isRu ? "Ощущ." : "Feels like"} {data.weather.feels_like}°C
              </div>
            </div>
          </div>

          <div style={{ background: "rgba(0,0,0,0.15)", borderRadius: "8px", padding: "10px" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "8px",
              }}
            >
              <span style={{ fontSize: "13px", color: "var(--text-muted)" }}>
                {isRu ? "Индекс качества воздуха (AQI)" : "Air Quality Index (AQI)"}
              </span>
              <AqiBadge category={data.air_quality.aqiCategory} label={data.air_quality.aqiLabel} />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", fontSize: "11px" }}>
              <div style={{ display: "flex", flexDirection: "column" }}>
                <span style={{ color: "var(--text-muted)" }}>PM2.5</span>
                <span
                  style={{
                    fontWeight: "600",
                    color:
                      data.air_quality.components.pm25 > 25
                        ? "#ef4444"
                        : "var(--text-main)",
                  }}
                >
                  {data.air_quality.components.pm25} {isRu ? "мкг/м³" : "mcg/m³"}
                </span>
              </div>
              <div style={{ display: "flex", flexDirection: "column" }}>
                <span style={{ color: "var(--text-muted)" }}>PM10</span>
                <span
                  style={{
                    fontWeight: "600",
                    color:
                      data.air_quality.components.pm10 > 50
                        ? "#ef4444"
                        : "var(--text-main)",
                  }}
                >
                  {data.air_quality.components.pm10} {isRu ? "мкг/м³" : "mcg/m³"}
                </span>
              </div>
              <div style={{ display: "flex", flexDirection: "column" }}>
                <span style={{ color: "var(--text-muted)" }}>NO2</span>
                <span style={{ fontWeight: "600" }}>{data.air_quality.components.no2}</span>
              </div>
            </div>
          </div>

          <div>
            <div
              style={{
                fontSize: "13px",
                fontWeight: "600",
                marginBottom: "6px",
                color: "var(--text-main)",
                display: "flex",
                alignItems: "center",
                gap: "4px",
              }}
            >
              <span>👕</span> {isRu ? "Как одеться:" : "What to wear:"}
            </div>
            <ul style={{ margin: 0, paddingLeft: "20px", fontSize: "12px", color: "var(--text-muted)" }}>
              {data.recommendations.clothing.map((item, idx) => (
                <li key={idx} style={{ marginBottom: "2px" }}>
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <div
              style={{
                fontSize: "13px",
                fontWeight: "600",
                marginBottom: "6px",
                color: "var(--text-main)",
                display: "flex",
                alignItems: "center",
                gap: "4px",
              }}
            >
              <span>💡</span>{" "}
              {isRu ? "Советы перед выходом:" : "Tips before you head out:"}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {data.recommendations.tips.map((tip, idx) => (
                <div
                  key={idx}
                  style={{
                    fontSize: "12px",
                    padding: "8px",
                    background:
                      data.air_quality.aqiIndex >= 4
                        ? "rgba(239, 68, 68, 0.1)"
                        : "rgba(56, 189, 248, 0.1)",
                    borderLeft: `3px solid ${
                      data.air_quality.aqiIndex >= 4 ? "#ef4444" : "#38bdf8"
                    }`,
                    borderRadius: "0 4px 4px 0",
                    color: "var(--text-main)",
                  }}
                >
                  {tip}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

