"use client";

import { useState, useCallback } from "react";
import { useI18n } from "@/lib/i18n";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const FEATURES = [
  { name: "Year", labelRu: "Год", min: 1990, max: 2024, step: 1, default: 2022 },
  { name: "Avg Rainfall (mm/day)", labelRu: "Средние осадки (мм/день)", min: 0, max: 50, step: 0.5, default: 12 },
  { name: "River Water Level (m)", labelRu: "Уровень воды в реке (м)", min: 0, max: 15, step: 0.1, default: 4.5 },
  { name: "Drainage Capacity (%)", labelRu: "Пропускная способность дренажа (%)", min: 5, max: 100, step: 1, default: 60 },
  { name: "Urbanization Level (%)", labelRu: "Уровень урбанизации (%)", min: 10, max: 100, step: 1, default: 70 },
  { name: "Elevation (m)", labelRu: "Высота (м)", min: 0, max: 500, step: 5, default: 50 },
  { name: "Deforestation Rate (%)", labelRu: "Уровень вырубки леса (%)", min: 0, max: 80, step: 1, default: 25 },
  { name: "Population Density (k/km²)", labelRu: "Плотность населения (тыс/км²)", min: 0.1, max: 50, step: 0.1, default: 8 },
  { name: "Infrastructure Age (yrs)", labelRu: "Возраст инфраструктуры (лет)", min: 1, max: 100, step: 1, default: 30 },
  { name: "Flood History Index", labelRu: "Индекс истории наводнений", min: 0, max: 100, step: 1, default: 45 },
];

export default function FloodRiskPanel() {
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
          data.detail || (isRu ? "Не удалось оценить риск" : "Prediction failed")
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

  const getRiskLevel = (prediction) => {
    const abs = Math.abs(prediction);
    if (abs < 5) {
      return {
        label: isRu ? "НИЗКИЙ" : "LOW",
        color: "#22c55e",
        bg: "rgba(34,197,94,0.12)",
      };
    }
    if (abs < 15) {
      return {
        label: isRu ? "УМЕРЕННЫЙ" : "MODERATE",
        color: "#eab308",
        bg: "rgba(234,179,8,0.12)",
      };
    }
    if (abs < 30) {
      return {
        label: isRu ? "ВЫСОКИЙ" : "HIGH",
        color: "#f97316",
        bg: "rgba(249,115,22,0.12)",
      };
    }
    return {
      label: isRu ? "КРИТИЧЕСКИЙ" : "CRITICAL",
      color: "#ef4444",
      bg: "rgba(239,68,68,0.12)",
    };
  };

  const risk = result ? getRiskLevel(result.prediction) : null;
  const barWidth = result
    ? Math.min(100, Math.max(0, (Math.abs(result.prediction) / 50) * 100))
    : 0;

  return (
    <div className="glass-card">
      <div className="glass-card-title">
        <span className="icon">🌊</span>
        {isRu ? "Оценка риска наводнений" : "Flood Risk Assessment"}
        <span
          style={{
            marginLeft: "auto",
            fontSize: 10,
            padding: "2px 8px",
            borderRadius: 8,
            background: "rgba(249, 115, 22, 0.15)",
            color: "#f97316",
            fontWeight: 600,
          }}
        >
          {isRu ? "Городской риск" : "Urban Risk"}
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
              style={{ width: "100%", accentColor: "#f97316" }}
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
            ? "rgba(249, 115, 22, 0.3)"
            : "linear-gradient(135deg, #ea580c, #f97316)",
          color: "#fff",
          fontWeight: 600,
          fontSize: 13,
          cursor: loading ? "wait" : "pointer",
          transition: "all 0.2s",
        }}
      >
        {loading
          ? isRu
            ? "Оценка..."
            : "Assessing..."
          : isRu
          ? "Оценить риск"
          : "Assess Risk"}
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

      {result && risk && (
        <div
          style={{
            marginTop: 12,
            padding: "12px",
            borderRadius: 8,
            background: risk.bg,
            border: `1px solid ${risk.color}33`,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 8,
            }}
          >
            <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
              <span style={{ fontSize: 22, fontWeight: 700, color: risk.color }}>
                {result.prediction.toFixed(2)}
              </span>
              <span style={{ fontSize: 12, color: "var(--text-muted, #94a3b8)" }}>
                {result.unit}
              </span>
            </div>
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                padding: "3px 10px",
                borderRadius: 6,
                background: `${risk.color}22`,
                color: risk.color,
                letterSpacing: 0.5,
              }}
            >
              {risk.label}
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
                background: `linear-gradient(90deg, ${risk.color}88, ${risk.color})`,
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
            {isRu ? "Шкала ущерба от наводнений" : "Flood Damage Scale"}
          </div>
        </div>
      )}
    </div>
  );
}

