"use client";

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import Map from "react-map-gl/maplibre";
import { GeoJsonLayer } from "@deck.gl/layers";
import DeckGLOverlay from "./DeckGLOverlay";
import WeatherLayer, { WeatherTooltip } from "./WeatherLayer";
import { useAppState, useAppActions } from "@/lib/store";
import { useI18n } from "@/lib/i18n";
import {
  fetchWindRoseData,
  fetchTectonicPlatesData,
  fetchWaveHeightData,
  fetchWildfiresData,
  fetchVolcanicActivityData,
} from "@/lib/realtimeData";
import {
  createWindRoseLayers,
  createTectonicPlatesLayers,
  createWaveHeightLayers,
  createWildfireLayers,
  createVolcanicActivityLayers,
  createPinLayer,
  createSelectedPointsLayer,
} from "@/lib/layerFactory";
import "maplibre-gl/dist/maplibre-gl.css";

const INITIAL_VIEW_STATE = {
  longitude: 68.77,
  latitude: 41.31,
  zoom: 5,
  pitch: 35,
  bearing: -10,
  minZoom: 2,
  maxZoom: 18,
};

const MAP_STYLE =
  "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

const ASSET_COLORS = {
  warehouse: [56, 189, 248, 200],
  office: [167, 139, 250, 200],
  data_center: [52, 211, 153, 200],
  industrial: [251, 146, 60, 200],
  operations: [244, 114, 182, 200],
  building: [148, 163, 184, 200],
};

const HIGHLIGHT_COLOR = [14, 165, 233, 255];

// РљР°СЂС‚Р° Р·Р°РіСЂСѓР·С‡РёРєРѕРІ: РєР»СЋС‡ СЃР»РѕСЏ в†’ С„СѓРЅРєС†РёСЏ Р·Р°РіСЂСѓР·РєРё РґР°РЅРЅС‹С…
// РќРµРєРѕС‚РѕСЂС‹Рµ С„СѓРЅРєС†РёРё РїСЂРёРЅРёРјР°СЋС‚ viewState РґР»СЏ Р·Р°РїСЂРѕСЃРѕРІ, Р·Р°РІРёСЃСЏС‰РёС… РѕС‚ РѕР±Р»Р°СЃС‚Рё РІРёРґРёРјРѕСЃС‚Рё РєР°СЂС‚С‹
const LAYER_FETCHERS = {
  windRose: (vs) => fetchWindRoseData(vs),
  tectonicPlates: () => fetchTectonicPlatesData(),
  waveHeight: (vs) => fetchWaveHeightData(vs),
  wildfires: () => fetchWildfiresData(),
  volcanicActivity: () => fetchVolcanicActivityData(),
};

// РЎР»РѕРё, Р·Р°РІРёСЃСЏС‰РёРµ РѕС‚ РїРѕР·РёС†РёРё Рё РјР°СЃС€С‚Р°Р±Р° РєР°СЂС‚С‹
const VIEWPORT_LAYERS = new Set(["windRose", "waveHeight"]);

// РРЅС‚РµСЂРІР°Р» Р°РІС‚РѕРѕР±РЅРѕРІР»РµРЅРёСЏ РґР°РЅРЅС‹С… (РІ РјРёР»Р»РёСЃРµРєСѓРЅРґР°С…)
const REFRESH_INTERVAL = 5 * 60 * 1000; // 5 РјРёРЅСѓС‚

// РљР°СЂС‚Р° СЃР±РѕСЂС‰РёРєРѕРІ: РєР»СЋС‡ СЃР»РѕСЏ в†’ С„СѓРЅРєС†РёСЏ СЃРѕР·РґР°РЅРёСЏ СЃР»РѕСЏ deck.gl
const LAYER_BUILDERS = {
  windRose: createWindRoseLayers,
  tectonicPlates: createTectonicPlatesLayers,
  waveHeight: createWaveHeightLayers,
  wildfires: createWildfireLayers,
  volcanicActivity: createVolcanicActivityLayers,
};

export default function MapView({
  geojsonData,
  onAssetHover,
  onAssetClick,
  weatherEnabled = false,
}) {
  const { lang, locale } = useI18n();
  const isRu = lang === "ru";

  const [hoverInfo, setHoverInfo] = useState(null);
  const [layerHoverInfo, setLayerHoverInfo] = useState(null);
  const [weatherHover, setWeatherHover] = useState(null);
  const [viewState, setViewState] = useState(INITIAL_VIEW_STATE);
  const [weatherLayers, setWeatherLayers] = useState([]);

  // РљРµС€ РґР°РЅРЅС‹С… СЃР»РѕРµРІ
  const [layerData, setLayerData] = useState({});

  // Р“Р»РѕР±Р°Р»СЊРЅРѕРµ СЃРѕСЃС‚РѕСЏРЅРёРµ РїСЂРёР»РѕР¶РµРЅРёСЏ
  const { activePin, selectedPoints, layers } = useAppState();
  const { setActivePin, addSelectedPoint } = useAppActions();

  // РћС‚СЃР»РµР¶РёРІР°РЅРёРµ РЅР°Р¶Р°С‚РѕР№ РєР»Р°РІРёС€Рё Shift
  const shiftPressed = useRef(false);
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === "Shift") shiftPressed.current = true;
    };
    const onKeyUp = (e) => {
      if (e.key === "Shift") shiftPressed.current = false;
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  // в”Ђв”Ђ Р—Р°РіСЂСѓР·РєР° РґР°РЅРЅС‹С… РІ СЂРµР°Р»СЊРЅРѕРј РІСЂРµРјРµРЅРё РїСЂРё РІРєР»СЋС‡РµРЅРёРё СЃР»РѕРµРІ в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
  const fetchLayerData = useCallback(
    (key, force = false) => {
      if (!layers[key]) return;
      if (!force && layerData[key]) return;

      const fetcher = LAYER_FETCHERS[key];
      if (!fetcher) return;

      fetcher(viewState)
        .then((data) => {
          setLayerData((prev) => ({ ...prev, [key]: data }));
        })
        .catch((err) => {
          console.warn(`Layer ${key} fetch error:`, err.message);
        });
    },
    [layers, layerData, viewState]
  );

  // РџРµСЂРІРёС‡РЅР°СЏ Р·Р°РіСЂСѓР·РєР° РїСЂРё Р°РєС‚РёРІР°С†РёРё СЃР»РѕСЏ
  useEffect(() => {
    Object.entries(layers).forEach(([key, enabled]) => {
      if (enabled && !layerData[key]) {
        fetchLayerData(key);
      }
    });
  }, [layers, layerData, fetchLayerData]);

  // РђРІС‚РѕРјР°С‚РёС‡РµСЃРєРѕРµ РѕР±РЅРѕРІР»РµРЅРёРµ Р°РєС‚РёРІРЅС‹С… СЃР»РѕРµРІ РєР°Р¶РґС‹Рµ 5 РјРёРЅСѓС‚
  useEffect(() => {
    const activeKeys = Object.entries(layers)
      .filter(([, enabled]) => enabled)
      .map(([key]) => key);
    if (activeKeys.length === 0) return;

    const interval = setInterval(() => {
      activeKeys.forEach((key) => {
        if (layers[key]) {
          const fetcher = LAYER_FETCHERS[key];
          if (fetcher) {
            fetcher(viewState)
              .then((data) => {
                setLayerData((prev) => ({ ...prev, [key]: data }));
              })
              .catch((err) => {
                console.warn(`Layer ${key} refresh error:`, err.message);
              });
          }
        }
      });
    }, REFRESH_INTERVAL);

    return () => clearInterval(interval);
  }, [layers, viewState]);

  const handleMove = useCallback((evt) => {
    setViewState(evt.viewState);
  }, []);

  // в”Ђв”Ђ РћР±РЅРѕРІР»РµРЅРёРµ СЃР»РѕРµРІ, Р·Р°РІРёСЃСЏС‰РёС… РѕС‚ РѕР±Р»Р°СЃС‚Рё РїСЂРѕСЃРјРѕС‚СЂР° (debounce РёР»Рё onMoveEnd) в”Ђв”Ђ
  const handleMoveEnd = useCallback((evt) => {
    VIEWPORT_LAYERS.forEach((key) => {
      if (layers[key]) {
        fetchLayerData(key, true); // force re-fetch with new viewport
      }
    });
  }, [layers, fetchLayerData]);


  const handleWeatherLayers = useCallback((lyrs) => {
    setWeatherLayers(lyrs);
  }, []);

  // в”Ђв”Ђ РћР±СЂР°Р±РѕС‚РєР° РєР»РёРєР° РїРѕ РєР°СЂС‚Рµ в†’ СѓСЃС‚Р°РЅРѕРІРєР° РјР°СЂРєРµСЂР° РёР»Рё РІС‹РґРµР»РµРЅРёСЏ РјРЅРѕР¶РµСЃС‚РІР° С‚РѕС‡РµРє в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
  const handleMapClick = useCallback(
    (event) => {
      // Р•СЃР»Рё РєР»РёРє РїСЂРёС€РµР»СЃСЏ РЅР° РѕР±СЉРµРєС‚ (Р°РєС‚РёРІ), РїРѕР·РІРѕР»СЏРµРј РµРіРѕ РѕР±СЂР°Р±РѕС‚С‡РёРєСѓ СЂР°Р·РѕР±СЂР°С‚СЊСЃСЏ
      if (event.features?.length) return;

      const [lng, lat] = event.lngLat
        ? [event.lngLat.lng, event.lngLat.lat]
        : [event.coordinate?.[0], event.coordinate?.[1]];

      if (lng == null || lat == null) return;

      const pinId = `pin-${Date.now()}`;
      const pin = { lat, lng, id: pinId };

      if (shiftPressed.current && selectedPoints.length < 5) {
        addSelectedPoint({
          ...pin,
          label: `#${selectedPoints.length + 1}`,
        });
      } else {
        setActivePin(pin);
      }
    },
    [setActivePin, addSelectedPoint, selectedPoints.length]
  );

  // в”Ђв”Ђ РћР±СЂР°Р±РѕС‚С‡РёРє РЅР°РІРµРґРµРЅРёСЏ РЅР° СЃР»РѕРё РґР°РЅРЅС‹С… в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
  const handleLayerHover = useCallback((info) => {
    setLayerHoverInfo(info);
  }, []);

  const getAssetColor = useCallback((feature) => {
    const type = feature?.properties?.asset_type || "building";
    return ASSET_COLORS[type] || ASSET_COLORS.building;
  }, []);

  const getElevation = useCallback((feature) => {
    const floors = feature?.properties?.floors;
    if (floors) return floors * 4;
    const area = feature?.properties?.floor_area_sqm || 2000;
    return Math.min(Math.max(area / 200, 10), 120);
  }, []);

  // в”Ђв”Ђ РЎР»РѕРё Р°РєС‚РёРІРѕРІ (Р·РґР°РЅРёСЏ, РёРЅС„СЂР°СЃС‚СЂСѓРєС‚СѓСЂР°) в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
  const assetLayers = useMemo(() => {
    if (!geojsonData || !geojsonData.features?.length) return [];

    return [
      new GeoJsonLayer({
        id: "assets-fill",
        data: geojsonData,
        filled: true,
        stroked: true,
        getFillColor: (f) => getAssetColor(f),
        getLineColor: [56, 189, 248, 100],
        getLineWidth: 1,
        lineWidthMinPixels: 1,
        pickable: true,
        autoHighlight: true,
        highlightColor: HIGHLIGHT_COLOR,
        onHover: (info) => {
          setHoverInfo(info.object ? info : null);
          onAssetHover?.(info.object || null);
        },
        onClick: (info) => {
          onAssetClick?.(info.object || null);
        },
        parameters: { depthWriteEnabled: true },
      }),
      new GeoJsonLayer({
        id: "assets-3d",
        data: geojsonData,
        extruded: true,
        filled: true,
        getFillColor: (f) => {
          const c = getAssetColor(f);
          return [c[0], c[1], c[2], 160];
        },
        getElevation: (f) => getElevation(f),
        elevationScale: 10,
        wireframe: true,
        getLineColor: [56, 189, 248, 60],
        lineWidthMinPixels: 1,
        pickable: false,
        material: {
          ambient: 0.4,
          diffuse: 0.6,
          shininess: 40,
          specularColor: [56, 189, 248],
        },
      }),
    ];
  }, [geojsonData, getAssetColor, getElevation, onAssetHover, onAssetClick]);

  // в”Ђв”Ђ РЎР»РѕРё РіРµРѕ-РґР°РЅРЅС‹С… в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
  const dataLayers = useMemo(() => {
    const result = [];
    Object.entries(layers).forEach(([key, enabled]) => {
      if (enabled && layerData[key] && LAYER_BUILDERS[key]) {
        result.push(...LAYER_BUILDERS[key](layerData[key], handleLayerHover));
      }
    });
    return result;
  }, [layers, layerData, handleLayerHover]);

  // в”Ђв”Ђ РЎР»РѕРё РјР°СЂРєРµСЂРѕРІ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ Рё РІС‹РґРµР»РµРЅРёР№ в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
  const pinLayers = useMemo(() => createPinLayer(activePin), [activePin]);
  const selectionLayers = useMemo(
    () => createSelectedPointsLayer(selectedPoints),
    [selectedPoints]
  );

  // в”Ђв”Ђ РћР±СЉРµРґРёРЅРµРЅРёРµ РІСЃРµС… СЃР»РѕРµРІ РґР»СЏ СЂРµРЅРґРµСЂР° в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
  const allLayers = useMemo(
    () => [
      ...assetLayers,
      ...dataLayers,
      ...weatherLayers,
      ...pinLayers,
      ...selectionLayers,
    ],
    [assetLayers, dataLayers, weatherLayers, pinLayers, selectionLayers]
  );

  return (
    <div className="map-container">
      <Map
        initialViewState={INITIAL_VIEW_STATE}
        onMove={handleMove}
        onMoveEnd={handleMoveEnd}
        onClick={handleMapClick}
        mapStyle={MAP_STYLE}
        style={{ width: "100%", height: "100%" }}
        attributionControl={true}
        reuseMaps
      >
        <DeckGLOverlay layers={allLayers} />
      </Map>

      {/* Р—Р°РіСЂСѓР·С‡РёРє РїРѕРіРѕРґРЅС‹С… РґР°РЅРЅС‹С… (РєРѕРјРїРѕРЅРµРЅС‚ Р±РµР· UI) */}
      <WeatherLayer
        viewState={viewState}
        enabled={weatherEnabled}
        onHover={setWeatherHover}
        onLayersReady={handleWeatherLayers}
      />

      {/* РџРѕРґСЃРєР°Р·РєР° РґР»СЏ РїРѕРіРѕРґС‹ */}
      <WeatherTooltip hoverInfo={weatherHover} />

      {/* РџРѕРґСЃРєР°Р·РєР° РґР»СЏ Р°РєС‚РёРІРѕРІ (РїСЂРё РЅР°РІРµРґРµРЅРёРё) */}
      {hoverInfo && hoverInfo.object && (
        <div
          className="map-tooltip"
          style={{
            position: "absolute",
            left: hoverInfo.x + 12,
            top: hoverInfo.y - 12,
            zIndex: 100,
            pointerEvents: "none",
          }}
        >
          <div className="map-tooltip-title">
            {hoverInfo.object.properties?.name || (isRu ? "Неизвестный актив" : "Unknown asset")}
          </div>
          <div className="map-tooltip-row">
            <span>{isRu ? "Тип" : "Type"}</span>
            <span style={{ textTransform: "capitalize" }}>
              {hoverInfo.object.properties?.asset_type || "-"}
            </span>
          </div>
          {hoverInfo.object.properties?.value_usd && (
            <div className="map-tooltip-row">
              <span>{isRu ? "Стоимость" : "Value"}</span>
              <span>
                ${(hoverInfo.object.properties.value_usd / 1e6).toFixed(1)}M
              </span>
            </div>
          )}
        </div>
      )}

      {/* РџРѕРґСЃРєР°Р·РєР° РґР»СЏ СЃР»РѕРµРІ РіРµРѕ-РґР°РЅРЅС‹С… */}
      <LayerTooltip info={layerHoverInfo} lang={lang} locale={locale} />

      {/* РџРѕРґСЃРєР°Р·РєР° РїРѕ РєР»Р°РІРёС€Рµ Shift */}
      <div className="map-shift-hint">
        {isRu
          ? "Shift + Click - добавить точку к сравнению"
          : "Shift + Click - add point to comparison"}
      </div>
    </div>
  );
}

function translateLevel(value, isRu) {
  if (!value) return value;

  const ruToEn = {
    минимальная: "minimal",
    низкая: "low",
    умеренная: "moderate",
    высокая: "high",
    критическая: "critical",
  };

  const enToRu = {
    minimal: "минимальная",
    low: "низкая",
    moderate: "умеренная",
    high: "высокая",
    critical: "критическая",
  };

  const normalized = String(value).toLowerCase();
  if (isRu) {
    return enToRu[normalized] || value;
  }
  return ruToEn[normalized] || value;
}

function LayerTooltip({ info, lang, locale }) {
  if (!info || !info.object) return null;

  const isRu = lang === "ru";
  const props = info.object.properties;
  const type = info.layerType;

  const rows = [];

  switch (type) {
    case "windRose":
      rows.push([isRu ? "Скорость" : "Speed", `${props.speed} ${isRu ? "м/с" : "m/s"}`]);
      rows.push([isRu ? "Направление" : "Direction", `${props.direction}°`]);
      rows.push([isRu ? "Порывы" : "Gusts", `${props.gust} ${isRu ? "м/с" : "m/s"}`]);
      rows.push([isRu ? "Категория" : "Category", translateLevel(props.category, isRu)]);
      break;
    case "tectonicPlates":
      rows.push([isRu ? "Место" : "Location", props.name]);
      rows.push([isRu ? "Магнитуда" : "Magnitude", `M${props.magnitude}`]);
      rows.push([isRu ? "Глубина" : "Depth", `${props.depth} ${isRu ? "км" : "km"}`]);
      rows.push([isRu ? "Риск" : "Risk", translateLevel(props.risk, isRu)]);
      if (props.tsunami) rows.push([isRu ? "Цунами" : "Tsunami", isRu ? "Да" : "Yes"]);
      if (props.felt) rows.push([isRu ? "Ощутили" : "Felt by", `${props.felt} ${isRu ? "чел." : "people"}`]);
      break;
    case "waveHeight":
      rows.push([isRu ? "Регион" : "Region", props.region]);
      rows.push([isRu ? "Высота" : "Height", `${props.height} ${isRu ? "м" : "m"}`]);
      rows.push([isRu ? "Период" : "Period", `${props.period} ${isRu ? "с" : "s"}`]);
      rows.push([isRu ? "Категория" : "Category", translateLevel(props.category, isRu)]);
      break;
    case "wildfires":
      rows.push([isRu ? "Событие" : "Event", props.region]);
      rows.push([isRu ? "Интенсивность" : "Intensity", `${props.intensity}%`]);
      if (props.areaSqKm) rows.push([isRu ? "Площадь" : "Area", `${props.areaSqKm} ${isRu ? "км²" : "km²"}`]);
      rows.push([isRu ? "Источник" : "Source", props.source || "NASA FIRMS"]);
      if (props.detectedAt) rows.push([isRu ? "Дата" : "Date", new Date(props.detectedAt).toLocaleDateString(locale)]);
      break;
    case "volcanicActivity":
      rows.push([isRu ? "Вулкан" : "Volcano", props.name]);
      if (props.country) rows.push([isRu ? "Страна" : "Country", props.country]);
      rows.push([isRu ? "Уровень" : "Level", translateLevel(props.alertLevel, isRu)]);
      rows.push([isRu ? "Радиус" : "Radius", `${props.impactRadiusKm} ${isRu ? "км" : "km"}`]);
      rows.push([isRu ? "Событий" : "Events", props.seismicEvents24h]);
      if (props.lastEvent) rows.push([isRu ? "Последнее" : "Last event", new Date(props.lastEvent).toLocaleDateString(locale)]);
      rows.push([isRu ? "Источник" : "Source", props.source || "NASA EONET"]);
      break;
    default:
      return null;
  }

  return (
    <div
      className="map-tooltip"
      style={{
        position: "absolute",
        left: info.x + 12,
        top: info.y - 12,
        zIndex: 150,
        pointerEvents: "none",
      }}
    >
      {rows.map(([label, value]) => (
        <div key={label} className="map-tooltip-row">
          <span>{label}</span>
          <span>{value}</span>
        </div>
      ))}
    </div>
  );
}

