/**
 * Загрузчики данных в реальном времени — вызов эндпоинтов бэкенда, проксирующих
 * запросы к API USGS, NASA FIRMS / EONET и Open-Meteo.
 *
 * Каждая функция возвращает Promise<GeoJSON FeatureCollection>.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// ── Универсальный загрузчик с обработкой ошибок ─────────────────────

async function fetchLayer(path, params = {}) {
  const url = new URL(`${API_URL}${path}`);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null) url.searchParams.set(k, v);
  });

  const resp = await fetch(url.toString(), { signal: AbortSignal.timeout(20000) });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.detail || `HTTP ${resp.status}`);
  }
  return resp.json();
}

// ── 1. Роза ветров ────────────────────────────────────────────

export async function fetchWindRoseData(viewState) {
  return fetchLayer("/api/layers/wind", {
    lat: viewState?.latitude ?? 41,
    lon: viewState?.longitude ?? 69,
    zoom: Math.round(viewState?.zoom ?? 5),
  });
}

// ── 2. Землетрясения (заменяют тектонические плиты) ───────────────

export async function fetchTectonicPlatesData() {
  return fetchLayer("/api/layers/earthquakes", {
    period: "day",
    min_magnitude: 2.5,
  });
}

// ── 3. Высота волн ──────────────────────────────────────────

export async function fetchWaveHeightData(viewState) {
  return fetchLayer("/api/layers/waves", {
    lat: viewState?.latitude ?? 30,
    lon: viewState?.longitude ?? 0,
    zoom: Math.round(viewState?.zoom ?? 5),
  });
}

// ── 4. Лесные пожары ────────────────────────────────────────────

export async function fetchWildfiresData() {
  return fetchLayer("/api/layers/wildfires", {
    limit: 2000,
  });
}

// ── 5. Вулканическая активность ────────────────────────────────────

export async function fetchVolcanicActivityData() {
  return fetchLayer("/api/layers/volcanoes", {
    days: 365,
    limit: 100,
  });
}
