"use client";

import { useState, useCallback, useEffect } from "react";
import dynamic from "next/dynamic";
import Sidebar from "@/components/Sidebar";
import { AppProvider } from "@/lib/store";
import { I18nProvider, useI18n } from "@/lib/i18n";

// Загружаем MapView только на стороне клиента (deck.gl требует WebGL и браузерное окружение)
const MapView = dynamic(() => import("@/components/MapView"), {
  ssr: false,
  loading: () => (
    <div
      className="map-container"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#0a0e1a",
      }}
    >
      <div style={{ textAlign: "center", color: "#64748b" }}>
        <div className="spinner" style={{ margin: "0 auto 16px" }}></div>
        <div style={{ fontSize: 13, fontWeight: 500 }}>
          Initializing WebGL map engine...
        </div>
      </div>
    </div>
  ),
});

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

function HomeContent() {
  const { lang, setLang } = useI18n();

  // Состояния для хранения геоданных и выбранного актива
  const [geojsonData, setGeojsonData] = useState(null);
  const [selectedAsset, setSelectedAsset] = useState(null);
  const [weatherEnabled, setWeatherEnabled] = useState(true);

  const fetchAssets = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/assets`);
      if (res.ok) {
        const data = await res.json();
        setGeojsonData(data);
      }
    } catch (err) {
      console.warn("Бэкенд пока недоступен (Backend not available yet):", err.message);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchAssets();
  }, [fetchAssets]);

  const isRu = lang === "ru";
  const weatherTitle = weatherEnabled
    ? isRu
      ? "Скрыть погоду"
      : "Hide weather"
    : isRu
    ? "Показать погоду"
    : "Show weather";
  const weatherLabel = weatherEnabled
    ? isRu
      ? "Погода ON"
      : "Weather ON"
    : isRu
    ? "Погода OFF"
    : "Weather OFF";

  return (
    <div className="app-layout fade-in">
      <Sidebar
        assets={geojsonData}
        selectedAsset={selectedAsset}
        onAssetSelect={setSelectedAsset}
      />
      <MapView
        geojsonData={geojsonData}
        onAssetHover={() => {}}
        onAssetClick={(feature) => setSelectedAsset(feature)}
        weatherEnabled={weatherEnabled}
      />

      <div className="map-top-controls">
        <button
          id="weather-toggle"
          className={`weather-toggle-btn ${weatherEnabled ? "active" : ""}`}
          onClick={() => setWeatherEnabled((prev) => !prev)}
          title={weatherTitle}
        >
          <span className="weather-toggle-icon">🌡️</span>
          <span className="weather-toggle-text">{weatherLabel}</span>
        </button>

        <div
          className="lang-toggle"
          role="group"
          aria-label={isRu ? "Выбор языка" : "Language switch"}
        >
          <button
            className={`lang-toggle-btn ${lang === "ru" ? "active" : ""}`}
            onClick={() => setLang("ru")}
            title="Русский"
          >
            RU
          </button>
          <button
            className={`lang-toggle-btn ${lang === "en" ? "active" : ""}`}
            onClick={() => setLang("en")}
            title="English"
          >
            EN
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <I18nProvider>
      <AppProvider>
        <HomeContent />
      </AppProvider>
    </I18nProvider>
  );
}
