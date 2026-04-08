"use client";

import { useState, useCallback } from "react";
import { useI18n } from "@/lib/i18n";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const FEATURES = [
  { name: "Year", labelRu: "Год", min: 1990, max: 2024, step: 1, default: 2020 },
  { name: "Avg Temperature (C)", labelRu: "Средняя температура (°C)", min: -5, max: 35, step: 0.5, default: 15 },
  { name: "Precipitation (mm)", labelRu: "Осадки (мм)", min: 200, max: 3000, step: 10, default: 800 },
  { name: "CO2 Emissions (MT)", labelRu: "Выбросы CO2 (MT)", min: 0.5, max: 30, step: 0.5, default: 10 },
  { name: "Crop Yield (MT/ha)", labelRu: "Урожайность (MT/га)", min: 0.45, max: 5, step: 0.05, default: 2.5 },
  { name: "Extreme Weather Events", labelRu: "Экстремальные погодные события", min: 0, max: 10, step: 1, default: 3 },
  { name: "Irrigation Access (%)", labelRu: "Доступ к орошению (%)", min: 10, max: 100, step: 1, default: 50 },
  { name: "Pesticide Use (KG/ha)", labelRu: "Использование пестицидов (кг/га)", min: 0, max: 50, step: 0.5, default: 10 },
  { name: "Fertilizer Use (KG/ha)", labelRu: "Использование удобрений (кг/га)", min: 0, max: 100, step: 1, default: 40 },
  { name: "Soil Health Index", labelRu: "Индекс здоровья почвы", min: 30, max: 100, step: 1, default: 65 },
];

export default function TinyMLPanel() {
  const [values, setValues] = useState(FEATURES.map((f) => f.default));
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const { lang } = useI18n();
  const isRu = lang === "ru";

  const handleSliderChange = useCallback((index, value) => {
    setValues((prev) => {
      const next = [...prev];
      next[index] = parseFloat(value);
      return next;
    });
  }, []);

  const handlePredict = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_URL}/api/predict`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ features: values }),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(
          data.detail || (isRu ? "Не удалось выполнить прогноз" : "Prediction failed")
        );
      }
      const data = await response.json();
      setResult(data);
    } catch (err) {
      setError(
        err.message ||
          (isRu
            ? "Ошибка соединения. Запущен ли backend?"
            : "Connection error. Is the backend running?")
      );
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, [values, isRu]);

  const barWidth = result
    ? Math.min(100, Math.max(0, (Math.abs(result.prediction) / 50) * 100))
    : 0;

  return (
    <div className="glass-card">
      <div className="glass-card-title">
        <span className="icon">🧠</span>
        {isRu ? "Прогноз TinyML" : "TinyML Prediction"}
        <span
          style={{
            marginLeft: "auto",
            fontSize: 10,
            padding: "2px 8px",
            borderRadius: 8,
            background: "rgba(56, 189, 248, 0.15)",
            color: "var(--accent-blue, #38bdf8)",
            fontWeight: 600,
          }}
        >
          {isRu ? "948 параметров" : "948 params"}
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {FEATURES.map((feat, i) => (
          <div key={feat.name}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: 11,
                color: "var(--text-muted, #94a3b8)",
                marginBottom: 2,
              }}
            >
              <span>{isRu ? feat.labelRu : feat.name}</span>
              <span style={{ fontWeight: 600, color: "var(--text-primary, #e2e8f0)" }}>
                {values[i]}
              </span>
            </div>
            <input
              type="range"
              min={feat.min}
              max={feat.max}
              step={feat.step}
              value={values[i]}
              onChange={(e) => handleSliderChange(i, e.target.value)}
              style={{ width: "100%", accentColor: "#38bdf8" }}
            />
          </div>
        ))}
      </div>

      <button
        onClick={handlePredict}
        disabled={loading}
        style={{
          marginTop: 12,
          width: "100%",
          padding: "10px 0",
          borderRadius: 8,
          border: "none",
          background: loading
            ? "rgba(56, 189, 248, 0.3)"
            : "linear-gradient(135deg, #0ea5e9, #38bdf8)",
          color: "#fff",
          fontWeight: 600,
          fontSize: 13,
          cursor: loading ? "wait" : "pointer",
          transition: "all 0.2s",
        }}
      >
        {loading
          ? isRu
            ? "Прогнозирование..."
            : "Predicting..."
          : isRu
          ? "Рассчитать прогноз"
          : "Predict"}
      </button>

      {error && (
        <div
          style={{
            marginTop: 10,
            padding: "8px 12px",
            borderRadius: 8,
            background: "rgba(239, 68, 68, 0.1)",
            color: "#f87171",
            fontSize: 12,
          }}
        >
          {error}
        </div>
      )}

      {result && (
        <div
          style={{
            marginTop: 12,
            padding: "12px",
            borderRadius: 8,
            background: "rgba(56, 189, 248, 0.06)",
            border: "1px solid rgba(56, 189, 248, 0.15)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 6,
              marginBottom: 8,
            }}
          >
            <span style={{ fontSize: 22, fontWeight: 700, color: "#38bdf8" }}>
              {result.prediction.toFixed(2)}
            </span>
            <span style={{ fontSize: 12, color: "var(--text-muted, #94a3b8)" }}>
              {result.unit}
            </span>
          </div>

          <div
            style={{
              height: 6,
              borderRadius: 3,
              background: "rgba(255,255,255,0.05)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${barWidth}%`,
                borderRadius: 3,
                background: "linear-gradient(90deg, #0ea5e9, #38bdf8)",
                transition: "width 0.4s ease",
              }}
            />
          </div>
          <div
            style={{
              marginTop: 4,
              fontSize: 10,
              color: "var(--text-muted, #94a3b8)",
              textAlign: "right",
            }}
          >
            {isRu ? "Шкала экономического влияния" : "Economic Impact Scale"}
          </div>
        </div>
      )}
    </div>
  );
}

