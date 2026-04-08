"use client";

import { useState, useEffect } from "react";
import { fetchReportData } from "@/lib/mockData";
import { useI18n } from "@/lib/i18n";

const RU_MONTH_TO_EN = {
  Янв: "Jan",
  Фев: "Feb",
  Мар: "Mar",
  Апр: "Apr",
  Май: "May",
  Июн: "Jun",
  Июл: "Jul",
  Авг: "Aug",
  Сен: "Sep",
  Окт: "Oct",
  Ноя: "Nov",
  Дек: "Dec",
};

function riskColor(value) {
  if (value < 25) return "#22c55e";
  if (value < 50) return "#eab308";
  if (value < 75) return "#f97316";
  return "#ef4444";
}

function riskLabel(value, isRu) {
  if (value < 25) return isRu ? "Низкий" : "Low";
  if (value < 50) return isRu ? "Умеренный" : "Moderate";
  if (value < 75) return isRu ? "Высокий" : "High";
  return isRu ? "Критический" : "Critical";
}

function Bar({ value, max = 100, color, label }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div className="report-bar">
      <div className="report-bar-label">{label}</div>
      <div className="report-bar-track">
        <div
          className="report-bar-fill"
          style={{ width: `${pct}%`, background: color || riskColor(value) }}
        />
      </div>
      <div className="report-bar-value" style={{ color: color || riskColor(value) }}>
        {value}
      </div>
    </div>
  );
}

export default function ReportView({ points }) {
  const [data, setData] = useState(null);
  const { lang, locale } = useI18n();
  const isRu = lang === "ru";

  useEffect(() => {
    if (!points?.length) return;
    fetchReportData(points).then((result) => {
      setData(result);
    });
  }, [points]);

  const loading = points?.length > 0 && data === null;

  if (loading) {
    return (
      <div className="report-loading">
        <div className="spinner" style={{ width: 32, height: 32 }} />
        <div>{isRu ? "Генерация отчёта..." : "Generating report..."}</div>
      </div>
    );
  }

  if (!data?.length) {
    return (
      <div className="report-empty">
        <div style={{ fontSize: 48, marginBottom: 16 }}>📊</div>
        <div>{isRu ? "Нет данных для отчёта" : "No report data"}</div>
        <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 8 }}>
          {isRu
            ? "Добавьте точки на карте и нажмите «Сформировать отчёт»"
            : "Add points on the map and click “Generate report”"}
        </div>
      </div>
    );
  }

  const metrics = [
    { key: "aqi", label: isRu ? "Качество воздуха (AQI)" : "Air quality (AQI)", max: 200 },
    { key: "seismicRisk", label: isRu ? "Сейсмический риск" : "Seismic risk" },
    { key: "fireRisk", label: isRu ? "Пожарный риск" : "Fire risk" },
    { key: "floodRisk", label: isRu ? "Риск наводнений" : "Flood risk" },
    { key: "volcanicRisk", label: isRu ? "Вулканический риск" : "Volcanic risk" },
    { key: "waveHeight", label: isRu ? "Высота волн (м)" : "Wave height (m)", max: 8 },
    { key: "windSpeed", label: isRu ? "Скорость ветра (м/с)" : "Wind speed (m/s)", max: 30 },
    { key: "temperature", label: isRu ? "Температура (°C)" : "Temperature (°C)", max: 50 },
    { key: "humidity", label: isRu ? "Влажность (%)" : "Humidity (%)" },
    { key: "overallRisk", label: isRu ? "Общий риск" : "Overall risk" },
  ];

  return (
    <div className="report-container">
      <div className="report-header">
        <h1>{isRu ? "Сравнительный анализ локаций" : "Comparative location analysis"}</h1>
        <p>
          {isRu ? `Отчёт по ${data.length} точкам` : `Report for ${data.length} points`} |{" "}
          {new Date().toLocaleDateString(locale, {
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
        </p>
      </div>

      <div className="report-summary-grid">
        {data.map((loc) => (
          <div key={loc.id} className="report-summary-card">
            <div className="report-summary-label">{loc.label}</div>
            <div className="report-summary-coords">
              {loc.lat.toFixed(3)}°N, {loc.lng.toFixed(3)}°E
            </div>
            <div
              className="report-summary-risk"
              style={{ color: riskColor(loc.stats.overallRisk) }}
            >
              {loc.stats.overallRisk}
            </div>
            <div className="report-summary-risk-label">
              {riskLabel(loc.stats.overallRisk, isRu)}
            </div>
          </div>
        ))}
      </div>

      <div className="report-section">
        <h2>{isRu ? "Сравнительная таблица" : "Comparison table"}</h2>
        <div className="report-table-wrapper">
          <table className="report-table">
            <thead>
              <tr>
                <th>{isRu ? "Метрика" : "Metric"}</th>
                {data.map((loc) => (
                  <th key={loc.id}>{loc.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {metrics.map((m) => (
                <tr key={m.key}>
                  <td className="report-table-metric">{m.label}</td>
                  {data.map((loc) => {
                    const val = loc.stats[m.key];
                    return (
                      <td key={loc.id}>
                        <span
                          style={{
                            color:
                              m.key === "temperature" ||
                              m.key === "humidity" ||
                              m.key === "waveHeight" ||
                              m.key === "windSpeed"
                                ? "var(--text-primary)"
                                : riskColor(val),
                            fontWeight: 600,
                          }}
                        >
                          {val}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="report-section">
        <h2>{isRu ? "Детализация по локациям" : "Details by location"}</h2>
        <div className="report-details-grid">
          {data.map((loc) => (
            <div key={loc.id} className="report-detail-card">
              <div className="report-detail-header">
                <span className="report-detail-label">{loc.label}</span>
                <span className="report-detail-coords">
                  {loc.lat.toFixed(3)}, {loc.lng.toFixed(3)}
                </span>
              </div>
              <Bar value={loc.stats.aqi} max={200} label="AQI" />
              <Bar value={loc.stats.seismicRisk} label={isRu ? "Сейсм. риск" : "Seismic"} />
              <Bar value={loc.stats.fireRisk} label={isRu ? "Пожар. риск" : "Fire"} />
              <Bar value={loc.stats.floodRisk} label={isRu ? "Наводнения" : "Flood"} />
              <Bar value={loc.stats.volcanicRisk} label={isRu ? "Вулкан. риск" : "Volcanic"} />
              <Bar value={loc.stats.overallRisk} label={isRu ? "Общий риск" : "Overall"} />
            </div>
          ))}
        </div>
      </div>

      <div className="report-section">
        <h2>{isRu ? "Месячные тренды (температура)" : "Monthly trends (temperature)"}</h2>
        <div className="report-monthly-grid">
          {data.map((loc) => (
            <div key={loc.id} className="report-monthly-card">
              <div className="report-monthly-header">{loc.label}</div>
              <div className="report-monthly-chart">
                {loc.monthlyData.map((m) => {
                  const normalized = ((m.temperature + 20) / 60) * 100;
                  const monthLabel = isRu ? m.month : RU_MONTH_TO_EN[m.month] || m.month;
                  return (
                    <div key={m.month} className="report-monthly-bar-col">
                      <div className="report-monthly-val">{m.temperature}°</div>
                      <div className="report-monthly-bar-track">
                        <div
                          className="report-monthly-bar-fill"
                          style={{
                            height: `${Math.max(5, normalized)}%`,
                            background:
                              m.temperature < 0
                                ? "#38bdf8"
                                : m.temperature < 15
                                ? "#34d399"
                                : m.temperature < 30
                                ? "#fbbf24"
                                : "#ef4444",
                          }}
                        />
                      </div>
                      <div className="report-monthly-label">{monthLabel}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="report-section">
        <h2>{isRu ? "Текстовая сводка" : "Text summary"}</h2>
        <div className="report-text-summary">
          {data.map((loc) => {
            const s = loc.stats;
            const risks = [];
            if (s.seismicRisk > 50) risks.push(isRu ? "сейсмический" : "seismic");
            if (s.fireRisk > 50) risks.push(isRu ? "пожарный" : "fire");
            if (s.floodRisk > 50) risks.push(isRu ? "наводнений" : "flood");
            if (s.volcanicRisk > 50) risks.push(isRu ? "вулканический" : "volcanic");

            return (
              <div key={loc.id} className="report-text-block">
                <strong>{loc.label}</strong> ({loc.lat.toFixed(2)}°N, {loc.lng.toFixed(2)}°E):{" "}
                {isRu ? "общий уровень риска" : "overall risk level"} -{" "}
                <span style={{ color: riskColor(s.overallRisk), fontWeight: 700 }}>
                  {riskLabel(s.overallRisk, isRu)} ({s.overallRisk}/100)
                </span>
                . {isRu ? "Качество воздуха" : "Air quality"}: AQI {s.aqi}.
                {risks.length > 0 && (
                  <>
                    {" "}
                    {isRu ? "Повышенные риски" : "Elevated risks"}: {risks.join(", ")}.
                  </>
                )}
                {risks.length === 0 &&
                  (isRu
                    ? " Все показатели в пределах нормы."
                    : " All indicators are within normal range.")}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
