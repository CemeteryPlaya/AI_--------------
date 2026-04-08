/**
 * layerFactory.js — Создает слои deck.gl из GeoJSON FeatureCollections.
 * Каждый тип слоя имеет свое собственное визуальное представление.
 */

import { ScatterplotLayer, TextLayer } from "@deck.gl/layers";
import { HeatmapLayer } from "@deck.gl/aggregation-layers";

// ── Цветовые палитры ──────────────────────────────────────────

function windSpeedColor(speed) {
  if (speed < 5) return [100, 200, 150, 180];
  if (speed < 12) return [52, 211, 153, 200];
  if (speed < 20) return [250, 204, 21, 220];
  return [239, 68, 68, 240];
}

function earthquakeRiskColor(risk) {
  switch (risk) {
    case "critical": return [185, 28, 28, 240];    // темно-красный
    case "high":     return [239, 68, 68, 220];    // красный
    case "medium":   return [251, 146, 60, 200];   // оранжевый
    case "low":      return [250, 204, 21, 180];   // желтый
    default:         return [148, 163, 184, 180];
  }
}

function waveHeightColor(height) {
  if (height < 1) return [56, 189, 248, 120];
  if (height < 2.5) return [52, 211, 153, 160];
  if (height < 4) return [250, 204, 21, 180];
  if (height < 6) return [251, 146, 60, 200];
  return [239, 68, 68, 220];
}

function fireIntensityColor(intensity) {
  if (intensity < 25) return [250, 204, 21, 150];
  if (intensity < 50) return [251, 146, 60, 180];
  if (intensity < 75) return [239, 68, 68, 200];
  return [185, 28, 28, 240];
}

function volcanicAlertColor(level) {
  switch (level) {
    case "normal":   return [52, 211, 153, 180];
    case "advisory": return [250, 204, 21, 200];
    case "watch":    return [251, 146, 60, 220];
    case "warning":  return [239, 68, 68, 240];
    default:         return [148, 163, 184, 180];
  }
}

// ── Символ стрелки направления ветра ──────────────────────────
const WIND_ARROWS = [
  "\u2193", "\u2199", "\u2199", "\u2190",
  "\u2190", "\u2196", "\u2196", "\u2191",
  "\u2191", "\u2197", "\u2197", "\u2192",
  "\u2192", "\u2198", "\u2198", "\u2193",
];

function degToArrow(deg) {
  return WIND_ARROWS[Math.round(deg / 22.5) % 16];
}

// ═════════════════════════════════════════════════════════════
// Сборщики слоев
// ═════════════════════════════════════════════════════════════

export function createWindRoseLayers(data, onHover) {
  if (!data?.features?.length) return [];
  const features = data.features;

  return [
    // Точки скорости ветра
    new ScatterplotLayer({
      id: "wind-rose-dots",
      data: features,
      getPosition: (f) => f.geometry.coordinates,
      getRadius: 20000,
      getFillColor: (f) => windSpeedColor(f.properties.speed),
      radiusMinPixels: 6,
      radiusMaxPixels: 18,
      pickable: true,
      autoHighlight: true,
      highlightColor: [255, 255, 255, 60],
      onHover: (info) => onHover?.(info.object ? { ...info, layerType: "windRose" } : null),
    }),

    // Стрелки направления
    new TextLayer({
      id: "wind-rose-arrows",
      data: features,
      getPosition: (f) => f.geometry.coordinates,
      getText: (f) => degToArrow(f.properties.direction),
      getSize: 16,
      getColor: (f) => windSpeedColor(f.properties.speed),
      getTextAnchor: "middle",
      getAlignmentBaseline: "center",
      fontFamily: "Inter, sans-serif",
      fontWeight: 900,
      characterSet: "auto",
      outlineWidth: 3,
      outlineColor: [0, 0, 0, 200],
      pickable: false,
      sizeMinPixels: 12,
      sizeMaxPixels: 20,
    }),

    // Метки скорости
    new TextLayer({
      id: "wind-rose-labels",
      data: features,
      getPosition: (f) => f.geometry.coordinates,
      getText: (f) => f.properties.label,
      getSize: 10,
      getColor: [203, 213, 225, 200],
      getTextAnchor: "middle",
      getAlignmentBaseline: "top",
      getPixelOffset: [0, 14],
      fontFamily: "Inter, sans-serif",
      fontWeight: 600,
      characterSet: "auto",
      outlineWidth: 2,
      outlineColor: [0, 0, 0, 180],
      pickable: false,
      sizeMinPixels: 8,
      sizeMaxPixels: 12,
    }),
  ];
}

export function createTectonicPlatesLayers(data, onHover) {
  if (!data?.features?.length) return [];
  const features = data.features;

  return [
    // Радиус воздействия землетрясения (на основе магнитуды)
    new ScatterplotLayer({
      id: "earthquake-radius",
      data: features,
      getPosition: (f) => f.geometry.coordinates,
      getRadius: (f) => Math.pow(2, (f.properties.magnitude || 3)) * 2000,
      getFillColor: (f) => {
        const c = earthquakeRiskColor(f.properties.risk);
        return [c[0], c[1], c[2], 40];
      },
      radiusMinPixels: 8,
      radiusMaxPixels: 60,
      pickable: false,
    }),

    // Центральные точки землетрясений
    new ScatterplotLayer({
      id: "earthquake-centers",
      data: features,
      getPosition: (f) => f.geometry.coordinates,
      getRadius: (f) => Math.max(4000, f.properties.magnitude * 3000),
      getFillColor: (f) => earthquakeRiskColor(f.properties.risk),
      radiusMinPixels: 4,
      radiusMaxPixels: 18,
      pickable: true,
      autoHighlight: true,
      highlightColor: [255, 255, 255, 80],
      onHover: (info) => onHover?.(info.object ? { ...info, layerType: "tectonicPlates" } : null),
    }),

    // Метки магнитуды
    new TextLayer({
      id: "earthquake-labels",
      data: features,
      getPosition: (f) => f.geometry.coordinates,
      getText: (f) => `M${f.properties.magnitude}`,
      getSize: 10,
      getColor: [255, 255, 255, 220],
      getTextAnchor: "middle",
      getAlignmentBaseline: "top",
      getPixelOffset: [0, 14],
      fontFamily: "Inter, sans-serif",
      fontWeight: 700,
      characterSet: "auto",
      outlineWidth: 3,
      outlineColor: [0, 0, 0, 200],
      pickable: false,
      sizeMinPixels: 8,
      sizeMaxPixels: 13,
    }),
  ];
}

export function createWaveHeightLayers(data, onHover) {
  if (!data?.features?.length) return [];
  const features = data.features;

  return [
    // Круги высоты волн
    new ScatterplotLayer({
      id: "wave-height-circles",
      data: features,
      getPosition: (f) => f.geometry.coordinates,
      getRadius: (f) => f.properties.height * 15000,
      getFillColor: (f) => waveHeightColor(f.properties.height),
      radiusMinPixels: 4,
      radiusMaxPixels: 30,
      pickable: true,
      autoHighlight: true,
      highlightColor: [255, 255, 255, 40],
      onHover: (info) => onHover?.(info.object ? { ...info, layerType: "waveHeight" } : null),
    }),

    // Метки высоты
    new TextLayer({
      id: "wave-height-labels",
      data: features,
      getPosition: (f) => f.geometry.coordinates,
      getText: (f) => f.properties.label,
      getSize: 10,
      getColor: [255, 255, 255, 200],
      getTextAnchor: "middle",
      getAlignmentBaseline: "center",
      fontFamily: "Inter, sans-serif",
      fontWeight: 700,
      characterSet: "auto",
      outlineWidth: 2,
      outlineColor: [0, 0, 0, 200],
      pickable: false,
      sizeMinPixels: 8,
      sizeMaxPixels: 13,
    }),
  ];
}

export function createWildfireLayers(data, onHover) {
  if (!data?.features?.length) return [];
  const features = data.features;

  return [
    // Свечение тепловой карты (Heatmap)
    new HeatmapLayer({
      id: "wildfire-heatmap",
      data: features,
      getPosition: (f) => f.geometry.coordinates,
      getWeight: (f) => f.properties.intensity / 100,
      radiusPixels: 40,
      intensity: 1.5,
      threshold: 0.05,
      colorRange: [
        [255, 255, 178, 0],
        [254, 204, 92, 80],
        [253, 141, 60, 140],
        [240, 59, 32, 200],
        [189, 0, 38, 240],
      ],
      pickable: false,
    }),

    // Отдельные точки пожаров
    new ScatterplotLayer({
      id: "wildfire-points",
      data: features,
      getPosition: (f) => f.geometry.coordinates,
      getRadius: (f) => Math.sqrt(f.properties.areaSqKm) * 2000,
      getFillColor: (f) => fireIntensityColor(f.properties.intensity),
      radiusMinPixels: 3,
      radiusMaxPixels: 20,
      pickable: true,
      autoHighlight: true,
      highlightColor: [255, 255, 255, 60],
      onHover: (info) => onHover?.(info.object ? { ...info, layerType: "wildfires" } : null),
    }),
  ];
}

export function createVolcanicActivityLayers(data, onHover) {
  if (!data?.features?.length) return [];
  const features = data.features;

  return [
    // Круг радиуса воздействия
    new ScatterplotLayer({
      id: "volcanic-radius",
      data: features,
      getPosition: (f) => f.geometry.coordinates,
      getRadius: (f) => f.properties.impactRadiusKm * 1000,
      getFillColor: (f) => {
        const c = volcanicAlertColor(f.properties.alertLevel);
        return [c[0], c[1], c[2], 30];
      },
      getLineColor: (f) => volcanicAlertColor(f.properties.alertLevel),
      stroked: true,
      filled: true,
      lineWidthMinPixels: 1,
      radiusMinPixels: 15,
      radiusMaxPixels: 80,
      pickable: false,
    }),

    // Центральная точка вулкана
    new ScatterplotLayer({
      id: "volcanic-center",
      data: features,
      getPosition: (f) => f.geometry.coordinates,
      getRadius: 12000,
      getFillColor: (f) => volcanicAlertColor(f.properties.alertLevel),
      radiusMinPixels: 6,
      radiusMaxPixels: 16,
      pickable: true,
      autoHighlight: true,
      highlightColor: [255, 255, 255, 80],
      onHover: (info) => onHover?.(info.object ? { ...info, layerType: "volcanicActivity" } : null),
    }),

    // Метки названий вулканов
    new TextLayer({
      id: "volcanic-labels",
      data: features,
      getPosition: (f) => f.geometry.coordinates,
      getText: (f) => f.properties.name,
      getSize: 11,
      getColor: [255, 255, 255, 220],
      getTextAnchor: "middle",
      getAlignmentBaseline: "top",
      getPixelOffset: [0, 16],
      fontFamily: "Inter, sans-serif",
      fontWeight: 600,
      characterSet: "auto",
      outlineWidth: 3,
      outlineColor: [0, 0, 0, 200],
      pickable: false,
      sizeMinPixels: 9,
      sizeMaxPixels: 14,
    }),
  ];
}

// ═════════════════════════════════════════════════════════════
// Слои маркеров / выделения
// ═════════════════════════════════════════════════════════════

export function createPinLayer(pin) {
  if (!pin) return [];

  const data = [{ coordinates: [pin.lng, pin.lat], id: pin.id }];

  return [
    // Внешнее свечение
    new ScatterplotLayer({
      id: "active-pin-glow",
      data,
      getPosition: (d) => d.coordinates,
      getRadius: 30000,
      getFillColor: [14, 165, 233, 40],
      radiusMinPixels: 20,
      radiusMaxPixels: 50,
      pickable: false,
    }),
    // Внутренняя точка
    new ScatterplotLayer({
      id: "active-pin-center",
      data,
      getPosition: (d) => d.coordinates,
      getRadius: 12000,
      getFillColor: [14, 165, 233, 255],
      getLineColor: [255, 255, 255, 200],
      stroked: true,
      lineWidthMinPixels: 2,
      radiusMinPixels: 8,
      radiusMaxPixels: 16,
      pickable: false,
    }),
  ];
}

export function createSelectedPointsLayer(points) {
  if (!points?.length) return [];

  const data = points.map((p) => ({
    coordinates: [p.lng, p.lat],
    label: p.label,
    id: p.id,
  }));

  return [
    new ScatterplotLayer({
      id: "selected-points-glow",
      data,
      getPosition: (d) => d.coordinates,
      getRadius: 25000,
      getFillColor: [167, 139, 250, 40],
      radiusMinPixels: 16,
      radiusMaxPixels: 40,
      pickable: false,
    }),
    new ScatterplotLayer({
      id: "selected-points-center",
      data,
      getPosition: (d) => d.coordinates,
      getRadius: 10000,
      getFillColor: [167, 139, 250, 230],
      getLineColor: [255, 255, 255, 180],
      stroked: true,
      lineWidthMinPixels: 2,
      radiusMinPixels: 6,
      radiusMaxPixels: 14,
      pickable: false,
    }),
    new TextLayer({
      id: "selected-points-labels",
      data,
      getPosition: (d) => d.coordinates,
      getText: (d) => d.label,
      getSize: 11,
      getColor: [167, 139, 250, 255],
      getTextAnchor: "middle",
      getAlignmentBaseline: "top",
      getPixelOffset: [0, 16],
      fontFamily: "Inter, sans-serif",
      fontWeight: 700,
      characterSet: "auto",
      outlineWidth: 3,
      outlineColor: [0, 0, 0, 220],
      pickable: false,
      sizeMinPixels: 10,
      sizeMaxPixels: 14,
    }),
  ];
}
