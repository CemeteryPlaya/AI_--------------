"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { ScatterplotLayer, TextLayer } from "@deck.gl/layers";
import { useI18n } from "@/lib/i18n";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const DEBOUNCE_MS = 600;

/**
 * Преобразование температуры (°C) в цвет RGBA.
 */
function tempToColor(temp) {
  if (temp <= -20) return [67, 56, 202, 220];
  if (temp <= -10) return [100, 149, 237, 220];
  if (temp <= 0) return [56, 189, 248, 220];
  if (temp <= 10) return [52, 211, 153, 220];
  if (temp <= 20) return [250, 204, 21, 220];
  if (temp <= 30) return [251, 146, 60, 220];
  return [239, 68, 68, 220];
}

/**
 * Преобразование скорости ветра (м/с) в цвет RGBA.
 */
function windToColor(speed) {
  if (speed < 3) return [100, 200, 150, 200];
  if (speed < 7) return [52, 211, 153, 220];
  if (speed < 12) return [250, 204, 21, 230];
  if (speed < 18) return [251, 146, 60, 240];
  return [239, 68, 68, 250];
}

/**
 * Ярлык интенсивности порывов ветра
 */
function gustLabel(gust, isRu) {
  if (!gust && gust !== 0) return null;
  if (gust < 5) return isRu ? "слабые" : "light";
  if (gust < 10) return isRu ? "умеренные" : "moderate";
  if (gust < 15) return isRu ? "сильные" : "strong";
  if (gust < 20) return isRu ? "очень сильные" : "very strong";
  return isRu ? "штормовые" : "storm";
}

/**
 * Символ стрелки направления на основе градусов.
 * Используем простые ASCII-совместимые стрелки.
 */
const WIND_ARROWS = [
  "\u2193", "\u2199", "\u2199", "\u2190",
  "\u2190", "\u2196", "\u2196", "\u2191",
  "\u2191", "\u2197", "\u2197", "\u2192",
  "\u2192", "\u2198", "\u2198", "\u2193",
];

function degToArrow(deg) {
  const idx = Math.round(deg / 22.5) % 16;
  return WIND_ARROWS[idx];
}

/**
 * Набор символов для отрисовки стрелок и текста
 */
const WIND_CHAR_SET = "auto";

/**
 * Форматирование температуры со знаком
 */
function formatTemp(temp) {
  const rounded = Math.round(temp);
  return rounded > 0 ? `+${rounded}\u00B0` : `${rounded}\u00B0`;
}

/**
 * WeatherLayer — компонент загрузки погодных данных и отрисовки слоев (deck.gl)
 * для температуры и направления ветра.
 */
export default function WeatherLayer({ viewState, enabled, onHover, onLayersReady }) {
  const [weatherData, setWeatherData] = useState(null);
  const debounceTimer = useRef(null);
  const abortControllerRef = useRef(null);

  // Используем refs для коллбэков, чтобы избежать их использования как зависимостей в useMemo/useEffect
  const onHoverRef = useRef(onHover);
  const onLayersReadyRef = useRef(onLayersReady);
  useEffect(() => { onHoverRef.current = onHover; }, [onHover]);
  useEffect(() => { onLayersReadyRef.current = onLayersReady; }, [onLayersReady]);

  // Загрузка данных погоды с задержкой (дебаунсинг)
  const fetchWeather = useCallback(async (lat, lon, zoom) => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const res = await fetch(
        `${API_URL}/api/weather?lat=${lat}&lon=${lon}&zoom=${Math.round(zoom)}`,
        { signal: controller.signal }
      );

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || `HTTP ${res.status}`);
      }

      const data = await res.json();
      setWeatherData(data);
    } catch (err) {
      if (err.name !== "AbortError") {
        console.warn("Weather fetch error:", err.message);
      }
    }
  }, []);

  // Обработчик изменения области просмотра карты с задержкой
  useEffect(() => {
    if (!enabled || !viewState) return;

    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    debounceTimer.current = setTimeout(() => {
      fetchWeather(viewState.latitude, viewState.longitude, viewState.zoom);
    }, DEBOUNCE_MS);

    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, [viewState?.latitude, viewState?.longitude, viewState?.zoom, enabled, fetchWeather]);

  // Очистка данных при отключении слоя
  useEffect(() => {
    if (!enabled) {
      setWeatherData(null);
    }
  }, [enabled]);

  // Мемоизация округленного зума для предотвращения лишних рендеров слоев
  const roundedZoom = useMemo(() => {
    return viewState?.zoom ? Math.round(viewState.zoom * 10) / 10 : 5;
  }, [viewState?.zoom]);

  // Сборка слоев deck.gl на основе полученных данных
  const layers = useMemo(() => {
    if (!enabled || !weatherData || !weatherData.features?.length) return [];

    if (roundedZoom < 4.8) return [];

    const features = weatherData.features;

    // Стабильный обработчик наведения через ref
    const handleHover = (info) => {
      onHoverRef.current?.(info.object ? info : null);
    };

    return [
      // Светящийся фоновый круг маркера
      new ScatterplotLayer({
        id: "weather-glow",
        data: features,
        getPosition: (f) => f.geometry.coordinates,
        getRadius: 28000,
        getFillColor: (f) => {
          const c = tempToColor(f.properties.temp);
          return [c[0], c[1], c[2], 40];
        },
        radiusMinPixels: 20,
        radiusMaxPixels: 50,
        pickable: false,
        antialiasing: true,
      }),

      // Основная точка температуры
      new ScatterplotLayer({
        id: "weather-markers",
        data: features,
        getPosition: (f) => f.geometry.coordinates,
        getRadius: 16000,
        getFillColor: (f) => tempToColor(f.properties.temp),
        getLineColor: [255, 255, 255, 80],
        getLineWidth: 1,
        stroked: true,
        lineWidthMinPixels: 1,
        radiusMinPixels: 12,
        radiusMaxPixels: 32,
        pickable: true,
        autoHighlight: true,
        highlightColor: [255, 255, 255, 60],
        onHover: handleHover,
      }),

      // Текстовая метка температуры
      new TextLayer({
        id: "weather-labels",
        data: features,
        getPosition: (f) => f.geometry.coordinates,
        getText: (f) => formatTemp(f.properties.temp),
        getSize: 13,
        getColor: [255, 255, 255, 240],
        getTextAnchor: "middle",
        getAlignmentBaseline: "center",
        fontFamily: "Inter, sans-serif",
        fontWeight: 700,
        fontSettings: { sdf: true },
        characterSet: WIND_CHAR_SET,
        outlineWidth: 3,
        outlineColor: [0, 0, 0, 180],
        pickable: false,
        sizeMinPixels: 11,
        sizeMaxPixels: 16,
      }),

      // Название города под точкой
      new TextLayer({
        id: "weather-city-labels",
        data: features,
        getPosition: (f) => f.geometry.coordinates,
        getText: (f) => f.properties.city,
        getSize: 10,
        getColor: [203, 213, 225, 200],
        getTextAnchor: "middle",
        getAlignmentBaseline: "top",
        getPixelOffset: [0, 22],
        fontFamily: "Inter, sans-serif",
        fontWeight: 500,
        fontSettings: { sdf: true },
        characterSet: WIND_CHAR_SET,
        outlineWidth: 2,
        outlineColor: [0, 0, 0, 160],
        pickable: false,
        sizeMinPixels: 9,
        sizeMaxPixels: 13,
      }),

      // ── Стрелка направления ветра ──────────────────────────────
      new TextLayer({
        id: "weather-wind-arrows",
        data: features,
        getPosition: (f) => f.geometry.coordinates,
        getText: (f) => degToArrow(f.properties.wind_deg || 0),
        getSize: 18,
        getColor: (f) => windToColor(f.properties.wind_speed || 0),
        getTextAnchor: "middle",
        getAlignmentBaseline: "center",
        getPixelOffset: [32, 0],
        fontFamily: "Inter, sans-serif",
        fontWeight: 900,
        fontSettings: { sdf: true },
        characterSet: WIND_CHAR_SET,
        outlineWidth: 3,
        outlineColor: [0, 0, 0, 200],
        pickable: false,
        sizeMinPixels: 14,
        sizeMaxPixels: 22,
      }),

      // ── Метка скорости ветра рядом со стрелкой ────────────────────
      new TextLayer({
        id: "weather-wind-speed",
        data: features,
        getPosition: (f) => f.geometry.coordinates,
        getText: (f) => {
          const speed = f.properties.wind_speed || 0;
          const gust = f.properties.wind_gust;
          if (gust && gust > speed) {
            return `${speed}>${gust}`;
          }
          return `${speed}`;
        },
        getSize: 9,
        getColor: (f) => windToColor(f.properties.wind_speed || 0),
        getTextAnchor: "middle",
        getAlignmentBaseline: "top",
        getPixelOffset: [32, 10],
        fontFamily: "Inter, sans-serif",
        fontWeight: 600,
        fontSettings: { sdf: true },
        characterSet: WIND_CHAR_SET,
        outlineWidth: 2,
        outlineColor: [0, 0, 0, 180],
        pickable: false,
        sizeMinPixels: 7,
        sizeMaxPixels: 11,
      }),
    ];
  }, [enabled, weatherData, roundedZoom]);

  // Передача слоев родительскому компоненту
  const prevLayersRef = useRef(layers);
  useEffect(() => {
    if (prevLayersRef.current !== layers) {
      prevLayersRef.current = layers;
      onLayersReadyRef.current?.(layers);
    }
  }, [layers]);

  return null;
}

/**
 * WeatherTooltip — премиум-подсказка при наведении на маркер погоды.
 */
export function WeatherTooltip({ hoverInfo }) {
  const { lang } = useI18n();
  const isRu = lang === "ru";

  if (!hoverInfo || !hoverInfo.object) return null;

  const props = hoverInfo.object.properties;
  const color = tempToColor(props.temp);
  const rgbStr = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
  const windColor = windToColor(props.wind_speed || 0);
  const windRgb = `rgb(${windColor[0]}, ${windColor[1]}, ${windColor[2]})`;
  const gLabel = gustLabel(props.wind_gust, isRu);
  const arrow = degToArrow(props.wind_deg || 0);

  return (
    <div
      className="weather-tooltip"
      style={{
        position: "absolute",
        left: hoverInfo.x + 16,
        top: hoverInfo.y - 16,
        zIndex: 200,
        pointerEvents: "none",
      }}
    >
      {/* Заголовок (город, описание) */}
      <div className="weather-tooltip-header">
        <img
          src={props.icon_url}
          alt={props.description}
          className="weather-tooltip-icon"
        />
        <div>
          <div className="weather-tooltip-city">
            {props.city}, {props.country}
          </div>
          <div className="weather-tooltip-desc">{props.description}</div>
        </div>
      </div>

      {/* Основная температура */}
      <div className="weather-tooltip-temp" style={{ color: rgbStr }}>
        {formatTemp(props.temp)}
      </div>

      {/* Сетка дополнительных сведений */}
      <div className="weather-tooltip-grid">
        <div className="weather-tooltip-row">
          <span className="weather-tooltip-label">{isRu ? "Ощущается" : "Feels like"}</span>
          <span className="weather-tooltip-value">{formatTemp(props.feels_like)}</span>
        </div>
        <div className="weather-tooltip-row">
          <span className="weather-tooltip-label">{isRu ? "Мин / Макс" : "Min / Max"}</span>
          <span className="weather-tooltip-value">
            {formatTemp(props.temp_min)} / {formatTemp(props.temp_max)}
          </span>
        </div>
        <div className="weather-tooltip-row">
          <span className="weather-tooltip-label">{isRu ? "Влажность" : "Humidity"}</span>
          <span className="weather-tooltip-value">{props.humidity}%</span>
        </div>

        {/* ── Данные о ветре ─────────────────────────────── */}
        <div className="weather-tooltip-divider" />

        <div className="weather-tooltip-row">
          <span className="weather-tooltip-label">{isRu ? "Ветер" : "Wind"}</span>
          <span className="weather-tooltip-value" style={{ color: windRgb }}>
            {arrow} {props.wind_speed} {isRu ? "м/с" : "m/s"}
          </span>
        </div>

        <div className="weather-tooltip-row">
          <span className="weather-tooltip-label">{isRu ? "Направление" : "Direction"}</span>
          <span className="weather-tooltip-value">
            {props.wind_direction_full || props.wind_direction || "-"} ({props.wind_direction})
          </span>
        </div>

        {props.wind_gust != null && (
          <div className="weather-tooltip-row">
            <span className="weather-tooltip-label">{isRu ? "Порывы" : "Gusts"}</span>
            <span className="weather-tooltip-value" style={{ color: windRgb }}>
              {props.wind_gust} {isRu ? "м/с" : "m/s"}
              {gLabel && (
                <span className={`weather-gust-badge weather-gust-${props.wind_gust >= 15 ? "danger" : props.wind_gust >= 10 ? "warn" : "ok"}`}>
                  {gLabel}
                </span>
              )}
            </span>
          </div>
        )}

        <div className="weather-tooltip-row">
          <span className="weather-tooltip-label">{isRu ? "Давление" : "Pressure"}</span>
          <span className="weather-tooltip-value">{props.pressure} hPa</span>
        </div>
      </div>
    </div>
  );
}
