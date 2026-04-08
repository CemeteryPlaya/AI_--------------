"use client";

import { useEffect, useState, useCallback } from "react";
import { useAppState, useAppActions } from "@/lib/store";
import {
  checkGeolocationPermission,
  requestGeolocation,
} from "@/lib/geolocation";
import { useI18n } from "@/lib/i18n";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const SOURCE_LABELS = {
  ru: {
    gps: "GPS",
    cached: "Кэш",
    default: "По умолчанию",
  },
  en: {
    gps: "GPS",
    cached: "Cache",
    default: "Default",
  },
};

const SOURCE_COLORS = {
  gps: "#22c55e",
  cached: "#eab308",
  default: "#94a3b8",
};

const RU_TO_EN_AQI = {
  Хорошее: "Good",
  Умеренное: "Moderate",
  "Нездоровое для чувств. групп": "Unhealthy for sensitive groups",
  Нездоровое: "Unhealthy",
  Опасное: "Hazardous",
};

const EN_TO_RU_AQI = {
  Good: "Хорошее",
  Moderate: "Умеренное",
  "Unhealthy for Sensitive Groups": "Нездоровое для чувств. групп",
  "Unhealthy for sensitive groups": "Нездоровое для чувств. групп",
  Unhealthy: "Нездоровое",
  Hazardous: "Опасное",
};

const RU_TO_EN_SEISMIC = {
  Минимальная: "Minimal",
  Низкая: "Low",
  Умеренная: "Moderate",
  Высокая: "High",
};

const EN_TO_RU_SEISMIC = {
  Minimal: "Минимальная",
  Low: "Низкая",
  Moderate: "Умеренная",
  High: "Высокая",
};

function translateAqiLabel(label, isRu) {
  if (!label) return label;
  return isRu ? EN_TO_RU_AQI[label] || label : RU_TO_EN_AQI[label] || label;
}

function translateSeismicLabel(label, isRu) {
  if (!label) return label;
  return isRu ? EN_TO_RU_SEISMIC[label] || label : RU_TO_EN_SEISMIC[label] || label;
}

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

export default function GeoLocationWidget() {
  const { userLocation, localStats } = useAppState();
  const { setUserLocation, setLocalStats } = useAppActions();
  const { lang } = useI18n();
  const isRu = lang === "ru";

  const [permissionState, setPermissionState] = useState("unknown");
  const [loading, setLoading] = useState(false);
  const [statsLoading, setStatsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [statsError, setStatsError] = useState(null);

  useEffect(() => {
    checkGeolocationPermission().then(setPermissionState);
  }, []);

  useEffect(() => {
    if (userLocation) return;
    if (permissionState === "granted") {
      handleRequestLocation();
    }
  }, [permissionState]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchRealStats = useCallback(
    async (lat, lng) => {
      setStatsLoading(true);
      setStatsError(null);
      try {
        const res = await fetch(`${API_URL}/api/local-stats?lat=${lat}&lon=${lng}`);
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.detail || `HTTP ${res.status}`);
        }
        const data = await res.json();
        setLocalStats(data);
      } catch (err) {
        console.warn("Local stats fetch error:", err.message);
        setStatsError(err.message);
      } finally {
        setStatsLoading(false);
      }
    },
    [setLocalStats]
  );

  useEffect(() => {
    if (!userLocation) return;
    fetchRealStats(userLocation.lat, userLocation.lng);
  }, [userLocation, fetchRealStats]);

  const handleRequestLocation = useCallback(async () => {
    setLoading(true);
    setError(null);
    setLocalStats(null);

    const result = await requestGeolocation();

    if (result.error && result.source !== "gps") {
      setError(result.error);
    }

    setUserLocation(result);
    setLoading(false);

    checkGeolocationPermission().then(setPermissionState);
  }, [setUserLocation, setLocalStats]);

  if (!userLocation && !loading && permissionState !== "granted") {
    return (
      <div className="glass-card geo-permission-card">
        <div className="glass-card-title">
          <span className="icon">📍</span>
          {isRu ? "Определение местоположения" : "Location detection"}
        </div>

        <div className="geo-permission-body">
          <div className="geo-permission-icon">🌍</div>
          <div className="geo-permission-text">
            {isRu
              ? "Для отображения актуальных данных о погоде, качестве воздуха и природных угрозах разрешите доступ к вашему местоположению."
              : "Allow access to your location to show local weather, air quality and natural risk insights."}
          </div>

          <button
            className="btn btn-primary geo-permission-btn"
            onClick={handleRequestLocation}
          >
            <span>📍</span>{" "}
            {isRu ? "Разрешить доступ к геолокации" : "Allow geolocation access"}
          </button>

          <div className="geo-permission-note">
            {isRu
              ? "Данные используются только для локальной статистики и не передаются третьим лицам."
              : "Data is used only for local statistics and is not shared with third parties."}
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="glass-card">
        <div className="glass-card-title">
          <span className="icon">📍</span>
          {isRu ? "Определение местоположения" : "Location detection"}
        </div>
        <div style={{ textAlign: "center", padding: 20, color: "var(--text-muted)" }}>
          <div className="spinner" style={{ margin: "0 auto 10px" }} />
          <div style={{ fontSize: 12 }}>
            {isRu ? "Запрашиваем геолокацию..." : "Requesting geolocation..."}
          </div>
          <div style={{ fontSize: 11, marginTop: 4, opacity: 0.7 }}>
            {isRu
              ? "Разрешите доступ во всплывающем окне браузера"
              : "Allow access in your browser popup"}
          </div>
        </div>
      </div>
    );
  }

  if (!userLocation) return null;

  const anomalyEntries = localStats?.anomalyLabels
    ? Object.values(localStats.anomalyLabels)
    : [];

  return (
    <div className="glass-card">
      <div className="glass-card-title">
        <span className="icon">📍</span>
        {isRu ? "Сводка по вашему местоположению" : "Summary for your location"}
        <span
          className="geo-source-badge"
          style={{
            background: `${SOURCE_COLORS[userLocation.source]}22`,
            color: SOURCE_COLORS[userLocation.source],
          }}
        >
          {SOURCE_LABELS[lang][userLocation.source]}
        </span>
      </div>

      {error && (
        <div className="geo-error">
          <div className="geo-error-text">{error}</div>
          <button
            className="btn btn-secondary btn-sm"
            onClick={handleRequestLocation}
            style={{ marginTop: 6 }}
          >
            {isRu ? "Попробовать снова" : "Try again"}
          </button>
        </div>
      )}

      <div className="geo-coords">
        {localStats?.city && (
          <span className="geo-city">
            {localStats.city}
            {localStats.country ? `, ${localStats.country}` : ""}
          </span>
        )}
        <div className="geo-coords-line">
          <span>{userLocation.lat.toFixed(4)}°N</span>
          <span className="geo-coords-sep">/</span>
          <span>{userLocation.lng.toFixed(4)}°E</span>
          {userLocation.source !== "gps" && (
            <button
              className="geo-refresh-btn"
              onClick={handleRequestLocation}
              title={isRu ? "Обновить местоположение" : "Refresh location"}
            >
              🔄
            </button>
          )}
        </div>
      </div>

      {statsLoading && (
        <div style={{ textAlign: "center", padding: 16, color: "var(--text-muted)" }}>
          <div className="spinner" style={{ margin: "0 auto 8px" }} />
          <div style={{ fontSize: 11 }}>
            {isRu ? "Загрузка данных..." : "Loading data..."}
          </div>
        </div>
      )}

      {statsError && !statsLoading && (
        <div className="geo-error" style={{ marginTop: 8 }}>
          <div className="geo-error-text">
            {isRu ? "Ошибка загрузки данных" : "Data loading error"}: {statsError}
          </div>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => fetchRealStats(userLocation.lat, userLocation.lng)}
            style={{ marginTop: 6 }}
          >
            {isRu ? "Повторить" : "Retry"}
          </button>
        </div>
      )}

      {localStats && !statsLoading && (
        <>
          {localStats.description && (
            <div className="geo-weather-desc">
              {localStats.iconUrl && (
                <img
                  src={localStats.iconUrl}
                  alt={localStats.description}
                  className="geo-weather-icon"
                />
              )}
              <span style={{ textTransform: "capitalize" }}>{localStats.description}</span>
            </div>
          )}

          <div className="stats-grid" style={{ marginTop: 8 }}>
            <div className="stat-item">
              <div className="stat-value">{localStats.temperature}°</div>
              <div className="stat-label">{isRu ? "Температура" : "Temperature"}</div>
              <div className="stat-sub">
                {isRu ? "Ощущ." : "Feels like"} {localStats.feelsLike}°
              </div>
            </div>
            <div className="stat-item">
              <div className="stat-value">{localStats.aqi}</div>
              <div className="stat-label">AQI</div>
              <AqiBadge
                category={localStats.aqiCategory}
                label={translateAqiLabel(localStats.aqiLabel, isRu)}
              />
            </div>
            <div className="stat-item">
              <div className="stat-value">{localStats.seismicThreat}</div>
              <div className="stat-label">{isRu ? "Сейсм. угроза" : "Seismic risk"}</div>
              <span
                className={`badge ${
                  localStats.seismicThreat < 0.3
                    ? "badge-success"
                    : localStats.seismicThreat < 0.6
                    ? "badge-warning"
                    : "badge-error"
                }`}
              >
                {translateSeismicLabel(localStats.seismicLabel, isRu)}
              </span>
            </div>
            <div className="stat-item">
              <div className="stat-value">{localStats.humidity}%</div>
              <div className="stat-label">{isRu ? "Влажность" : "Humidity"}</div>
            </div>
          </div>

          <div className="geo-extra-row">
            <div className="geo-extra-item">
              <span className="geo-extra-label">{isRu ? "Ветер" : "Wind"}</span>
              <span className="geo-extra-value">
                {localStats.windSpeed} {isRu ? "м/с" : "m/s"}
                {localStats.windGust
                  ? ` (${isRu ? "порывы" : "gusts"} ${localStats.windGust})`
                  : ""}
              </span>
            </div>
            <div className="geo-extra-item">
              <span className="geo-extra-label">{isRu ? "Давление" : "Pressure"}</span>
              <span className="geo-extra-value">{localStats.pressure} hPa</span>
            </div>
          </div>

          {(localStats.pm25 > 0 || localStats.pm10 > 0) && (
            <div className="geo-extra-row">
              <div className="geo-extra-item">
                <span className="geo-extra-label">PM2.5</span>
                <span className="geo-extra-value">
                  {localStats.pm25} {isRu ? "мкг/м³" : "mcg/m³"}
                </span>
              </div>
              <div className="geo-extra-item">
                <span className="geo-extra-label">PM10</span>
                <span className="geo-extra-value">
                  {localStats.pm10} {isRu ? "мкг/м³" : "mcg/m³"}
                </span>
              </div>
            </div>
          )}

          {anomalyEntries.length > 0 && (
            <div className="geo-anomalies">
              <div className="geo-anomalies-label">{isRu ? "Аномалии:" : "Anomalies:"}</div>
              <div className="geo-anomalies-tags">
                {anomalyEntries.map((label) => (
                  <span key={label} className="badge badge-error">
                    {label}
                  </span>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

