"use client";

import { useAppState, useAppActions } from "@/lib/store";
import { useI18n } from "@/lib/i18n";

const LAYER_CONFIG = [
  {
    key: "windRose",
    label: { ru: "Роза ветров", en: "Wind field" },
    description: {
      ru: "Open-Meteo — обновление каждые 5 мин",
      en: "Open-Meteo — updates every 5 min",
    },
    icon: "💨",
    color: "#34d399",
  },
  {
    key: "tectonicPlates",
    label: { ru: "Землетрясения", en: "Earthquakes" },
    description: {
      ru: "Реальные данные USGS в реальном времени",
      en: "Live USGS feed",
    },
    icon: "🌋",
    color: "#ef4444",
  },
  {
    key: "waveHeight",
    label: { ru: "Высота волн", en: "Wave height" },
    description: {
      ru: "Open-Meteo Marine — в реальном времени",
      en: "Open-Meteo Marine — live data",
    },
    icon: "🌊",
    color: "#38bdf8",
  },
  {
    key: "wildfires",
    label: { ru: "Лесные пожары", en: "Wildfires" },
    description: {
      ru: "NASA FIRMS — спутниковые данные",
      en: "NASA FIRMS — satellite detections",
    },
    icon: "🔥",
    color: "#fb923c",
  },
  {
    key: "volcanicActivity",
    label: { ru: "Вулканическая активность", en: "Volcanic activity" },
    description: {
      ru: "NASA EONET — активность вулканов",
      en: "NASA EONET — volcanic events",
    },
    icon: "⛰️",
    color: "#f87171",
  },
];

export default function LayerControl() {
  const { layers } = useAppState();
  const { toggleLayer } = useAppActions();
  const { lang } = useI18n();
  const isRu = lang === "ru";

  const activeCount = Object.values(layers).filter(Boolean).length;

  return (
    <div className="glass-card">
      <div className="glass-card-title">
        <span className="icon">🗺️</span>
        {isRu ? "Менеджер слоёв" : "Layer manager"}
        {activeCount > 0 && (
          <span className="layer-control-badge">{activeCount}</span>
        )}
      </div>

      <div className="layer-control-list">
        {LAYER_CONFIG.map((layer) => {
          const isActive = layers[layer.key];

          return (
            <label
              key={layer.key}
              className={`layer-control-item ${isActive ? "active" : ""}`}
              style={isActive ? { borderColor: `${layer.color}66` } : {}}
            >
              <div className="layer-control-check">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={() => toggleLayer(layer.key)}
                />
                <span
                  className="layer-control-indicator"
                  style={
                    isActive
                      ? { background: layer.color, borderColor: layer.color }
                      : {}
                  }
                />
              </div>
              <span className="layer-control-icon">{layer.icon}</span>
              <div className="layer-control-info">
                <div className="layer-control-label">{layer.label[lang]}</div>
                <div className="layer-control-desc">{layer.description[lang]}</div>
              </div>
              {isActive && (
                <div
                  className="layer-control-dot"
                  style={{ background: layer.color }}
                />
              )}
            </label>
          );
        })}
      </div>
    </div>
  );
}

