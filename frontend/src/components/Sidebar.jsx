"use client";

import { useCallback } from "react";
import TinyMLPanel from "./TinyMLPanel";
import FloodRiskPanel from "./FloodRiskPanel";
import LayerControl from "./LayerControl";
import GeoLocationWidget from "./GeoLocationWidget";
import CityAirGuide from "./CityAirGuide";
import PinDetailPanel from "./PinDetailPanel";
import { useAppState, useAppActions } from "@/lib/store";
import { useI18n } from "@/lib/i18n";

export default function Sidebar({ assets, selectedAsset, onAssetSelect }) {
  const { selectedPoints } = useAppState();
  const { clearSelectedPoints } = useAppActions();
  const { lang } = useI18n();
  const isRu = lang === "ru";

  const features = assets?.features || [];

  const generateReportUrl = useCallback(() => {
    if (selectedPoints.length === 0) return null;
    const encoded = selectedPoints
      .map((p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`)
      .join("|");
    return `/report?points=${encodeURIComponent(encoded)}`;
  }, [selectedPoints]);

  const handleGenerateReport = () => {
    const url = generateReportUrl();
    if (url) {
      window.open(url, "_blank");
    }
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-brand">
          <div className="sidebar-brand-icon">🌍</div>
          <h1>Climate Risk Intelligence</h1>
        </div>
        <div className="sidebar-brand-subtitle">
          {isRu
            ? "Платформа аналитики физических рисков"
            : "Physical Risk Analytics Platform"}
        </div>
      </div>

      <div className="sidebar-content">
        <PinDetailPanel />

        {selectedPoints.length > 0 && (
          <div className="glass-card comparison-bar">
            <div className="glass-card-title">
              <span className="icon">📊</span>
              {isRu ? "Сравнение" : "Comparison"} ({selectedPoints.length}/5)
            </div>
            <div className="comparison-points">
              {selectedPoints.map((p) => (
                <div key={p.id} className="comparison-point">
                  <span className="comparison-point-label">{p.label}</span>
                  <span className="comparison-point-coords">
                    {p.lat.toFixed(2)}, {p.lng.toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
            <div className="comparison-actions">
              <button
                className="btn btn-primary btn-sm"
                onClick={handleGenerateReport}
              >
                {isRu ? "Сформировать отчёт" : "Generate report"}
              </button>
              <button
                className="btn btn-secondary btn-sm"
                onClick={clearSelectedPoints}
              >
                {isRu ? "Очистить" : "Clear"}
              </button>
            </div>
          </div>
        )}

        <GeoLocationWidget />
        <CityAirGuide />
        <LayerControl />
        <TinyMLPanel />
        <FloodRiskPanel />

        {features.length > 0 && (
          <div className="glass-card">
            <div className="glass-card-title">
              <span className="icon">🏢</span>
              {isRu ? "Реестр активов" : "Asset Registry"}
            </div>
            <div className="asset-list">
              {features.map((feature, idx) => {
                const props = feature.properties || {};
                const assetType = props.asset_type || "building";
                const isSelected = selectedAsset?.id === feature.id;

                return (
                  <div
                    key={feature.id || idx}
                    className="asset-item"
                    style={
                      isSelected
                        ? {
                            background: "rgba(56, 189, 248, 0.1)",
                            borderColor: "rgba(56, 189, 248, 0.4)",
                          }
                        : {}
                    }
                    onClick={() => onAssetSelect?.(feature)}
                  >
                    <div className={`asset-dot ${assetType}`} />
                    <div className="asset-info">
                      <div className="asset-name">
                        {props.name || (isRu ? `Актив ${idx + 1}` : `Asset ${idx + 1}`)}
                      </div>
                      <div className="asset-type">
                        {assetType.replace(/_/g, " ")}
                        {props.value_usd
                          ? ` • $${(props.value_usd / 1e6).toFixed(1)}M`
                          : ""}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {features.length === 0 && (
          <div
            style={{
              textAlign: "center",
              padding: "24px 16px",
              color: "var(--text-muted)",
              fontSize: 13,
            }}
          >
            <div style={{ fontSize: 40, marginBottom: 12 }}>🗺️</div>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>
              {isRu ? "Активы не загружены" : "No assets loaded"}
            </div>
            <div style={{ fontSize: 12 }}>
              {isRu
                ? "Загрузите файл GeoJSON, чтобы отобразить портфель на карте"
                : "Upload a GeoJSON file to visualize your portfolio on the map"}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}

