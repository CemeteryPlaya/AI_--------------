/**
 * Генераторы моковых данных GeoJSON для всех 5 слоев.
 * Каждая функция возвращает Promise<GeoJSON FeatureCollection>,
 * симулируя асинхронный вызов REST API с небольшой задержкой.
 */

// ── Вспомогательные функции ─────────────────────────────────────────────────
function delay(ms = 300) {
  return new Promise((r) => setTimeout(r, ms + Math.random() * 200));
}

function randomInRange(min, max) {
  return min + Math.random() * (max - min);
}

function featureCollection(features) {
  return { type: "FeatureCollection", features };
}

function pointFeature(lng, lat, properties = {}) {
  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: [lng, lat] },
    properties,
  };
}

function lineFeature(coordinates, properties = {}) {
  return {
    type: "Feature",
    geometry: { type: "LineString", coordinates },
    properties,
  };
}

function polygonFeature(coordinates, properties = {}) {
  return {
    type: "Feature",
    geometry: { type: "Polygon", coordinates },
    properties,
  };
}

// ─────────────────────────────────────────────────────────────
// 1. РОЗА ВЕТРОВ — векторные стрелки, показывающие направление и скорость ветра
// ─────────────────────────────────────────────────────────────
export async function fetchWindRoseData() {
  await delay(400);

  const features = [];
  // Сетка измерений ветра по Евразии
  for (let lat = 25; lat <= 65; lat += 5) {
    for (let lng = 30; lng <= 100; lng += 5) {
      const speed = randomInRange(1, 25); // m/s
      const direction = Math.random() * 360; // degrees
      const gustFactor = 1 + Math.random() * 0.6;

      features.push(
        pointFeature(
          lng + randomInRange(-1, 1),
          lat + randomInRange(-1, 1),
          {
            id: `wind-${lat}-${lng}`,
            speed: Math.round(speed * 10) / 10,
            direction: Math.round(direction),
            gust: Math.round(speed * gustFactor * 10) / 10,
            category: speed < 5 ? "calm" : speed < 12 ? "moderate" : speed < 20 ? "strong" : "storm",
            label: `${Math.round(speed)} м/с`,
          }
        )
      );
    }
  }

  return featureCollection(features);
}

// ─────────────────────────────────────────────────────────────
// 2. ТЕКТОНИЧЕСКИЕ ПЛИТЫ — линии границ и зоны разломов
// ─────────────────────────────────────────────────────────────
const PLATE_BOUNDARIES = [
  // Тихоокеанское огненное кольцо (упрощенно)
  { name: "Тихоокеанское огненное кольцо", type: "convergent", risk: "high",
    coords: [[140, 35], [145, 40], [150, 45], [155, 50], [160, 55], [165, 58]] },
  { name: "Альпийско-Гималайский пояс", type: "convergent", risk: "high",
    coords: [[10, 45], [20, 42], [30, 38], [40, 37], [50, 35], [60, 33], [70, 32], [80, 30], [85, 28], [90, 27]] },
  { name: "Восточно-Африканский рифт", type: "divergent", risk: "medium",
    coords: [[35, 15], [36, 10], [37, 5], [38, 0], [39, -5], [38, -10], [36, -15]] },
  { name: "Срединно-Атлантический хребет", type: "divergent", risk: "medium",
    coords: [[-35, 60], [-30, 50], [-25, 40], [-20, 30], [-15, 20], [-12, 10], [-14, 0]] },
  { name: "Северо-Анатолийский разлом", type: "transform", risk: "high",
    coords: [[26, 40.5], [30, 40.7], [34, 40.5], [38, 40], [42, 39.5]] },
  { name: "Разлом Сан-Андреас", type: "transform", risk: "high",
    coords: [[-124, 40], [-122, 38], [-120, 36], [-118, 34], [-116, 32]] },
  { name: "Зондская дуга", type: "convergent", risk: "high",
    coords: [[95, 5], [100, 0], [105, -5], [110, -8], [115, -8], [120, -7]] },
  { name: "Курило-Камчатский желоб", type: "convergent", risk: "high",
    coords: [[145, 44], [148, 46], [150, 48], [153, 50], [155, 52], [158, 54]] },
];

export async function fetchTectonicPlatesData() {
  await delay(350);

  const features = PLATE_BOUNDARIES.map((boundary) =>
    lineFeature(boundary.coords, {
      id: `tect-${boundary.name}`,
      name: boundary.name,
      type: boundary.type,
      risk: boundary.risk,
      movementRate: `${randomInRange(1, 12).toFixed(1)} см/год`,
      lastSignificantEvent: `${Math.floor(randomInRange(1, 50))} лет назад`,
    })
  );

  return featureCollection(features);
}

// ─────────────────────────────────────────────────────────────
// 3. ВЫСОТА ВОЛН — зоны океана с изолиниями высоты волн
// ─────────────────────────────────────────────────────────────
export async function fetchWaveHeightData() {
  await delay(500);

  const features = [];
  // Точки сетки океана
  const oceanRegions = [
    { name: "Северная Атлантика", latRange: [40, 65], lngRange: [-60, -10] },
    { name: "Тихий океан", latRange: [10, 55], lngRange: [140, 180] },
    { name: "Индийский океан", latRange: [-30, 10], lngRange: [50, 100] },
    { name: "Средиземное море", latRange: [30, 42], lngRange: [-5, 35] },
    { name: "Каспийское море", latRange: [37, 47], lngRange: [48, 55] },
  ];

  oceanRegions.forEach((region) => {
    const step = 3;
    for (let lat = region.latRange[0]; lat <= region.latRange[1]; lat += step) {
      for (let lng = region.lngRange[0]; lng <= region.lngRange[1]; lng += step) {
        const height = randomInRange(0.2, 8); // meters
        const period = randomInRange(3, 15); // seconds

        features.push(
          pointFeature(
            lng + randomInRange(-0.5, 0.5),
            lat + randomInRange(-0.5, 0.5),
            {
              id: `wave-${region.name}-${lat}-${lng}`,
              region: region.name,
              height: Math.round(height * 10) / 10,
              period: Math.round(period * 10) / 10,
              category:
                height < 1 ? "calm" :
                height < 2.5 ? "moderate" :
                height < 4 ? "rough" :
                height < 6 ? "very_rough" : "extreme",
              label: `${height.toFixed(1)} м`,
            }
          )
        );
      }
    }
  });

  return featureCollection(features);
}

// ─────────────────────────────────────────────────────────────
// 4. ЛЕСНЫЕ ПОЖАРЫ — кластерные точки / тепловая карта
// ─────────────────────────────────────────────────────────────
const FIRE_HOTSPOTS = [
  { region: "Сибирь", lat: [55, 65], lng: [80, 130], density: 40 },
  { region: "Калифорния", lat: [33, 40], lng: [-124, -117], density: 20 },
  { region: "Австралия", lat: [-38, -20], lng: [120, 150], density: 30 },
  { region: "Амазония", lat: [-15, 0], lng: [-65, -45], density: 25 },
  { region: "Средиземноморье", lat: [35, 42], lng: [0, 30], density: 15 },
  { region: "Центральная Африка", lat: [-10, 10], lng: [15, 35], density: 20 },
  { region: "Юго-Восточная Азия", lat: [-5, 15], lng: [95, 120], density: 15 },
];

export async function fetchWildfiresData() {
  await delay(450);

  const features = [];

  FIRE_HOTSPOTS.forEach((hotspot) => {
    for (let i = 0; i < hotspot.density; i++) {
      const lat = randomInRange(hotspot.lat[0], hotspot.lat[1]);
      const lng = randomInRange(hotspot.lng[0], hotspot.lng[1]);
      const intensity = randomInRange(1, 100);
      const areaSqKm = randomInRange(0.5, 500);

      features.push(
        pointFeature(lng, lat, {
          id: `fire-${hotspot.region}-${i}`,
          region: hotspot.region,
          intensity: Math.round(intensity),
          areaSqKm: Math.round(areaSqKm * 10) / 10,
          confidence: Math.round(randomInRange(50, 99)),
          detectedAt: new Date(Date.now() - Math.random() * 7 * 86400000).toISOString(),
          category:
            intensity < 25 ? "low" :
            intensity < 50 ? "moderate" :
            intensity < 75 ? "high" : "extreme",
          label: `${Math.round(areaSqKm)} км²`,
        })
      );
    }
  });

  return featureCollection(features);
}

// ─────────────────────────────────────────────────────────────
// 5. ВУЛКАНИЧЕСКАЯ АКТИВНОСТЬ — иконки с радиусом воздействия
// ─────────────────────────────────────────────────────────────
const VOLCANOES = [
  { name: "Везувий", lat: 40.821, lng: 14.426, country: "Италия" },
  { name: "Этна", lat: 37.751, lng: 14.994, country: "Италия" },
  { name: "Фудзияма", lat: 35.361, lng: 138.731, country: "Япония" },
  { name: "Килауэа", lat: 19.421, lng: -155.287, country: "США" },
  { name: "Мерапи", lat: -7.541, lng: 110.446, country: "Индонезия" },
  { name: "Попокатепетль", lat: 19.023, lng: -98.628, country: "Мексика" },
  { name: "Эйяфьятлайокюдль", lat: 63.633, lng: -19.633, country: "Исландия" },
  { name: "Ключевская Сопка", lat: 56.056, lng: 160.642, country: "Россия" },
  { name: "Котопахи", lat: -0.677, lng: -78.436, country: "Эквадор" },
  { name: "Пинатубо", lat: 15.143, lng: 120.35, country: "Филиппины" },
  { name: "Кракатау", lat: -6.102, lng: 105.423, country: "Индонезия" },
  { name: "Сент-Хеленс", lat: 46.2, lng: -122.18, country: "США" },
  { name: "Тамбора", lat: -8.25, lng: 118.0, country: "Индонезия" },
  { name: "Камерун", lat: 4.203, lng: 9.17, country: "Камерун" },
  { name: "Эльбрус", lat: 43.355, lng: 42.439, country: "Россия" },
];

export async function fetchVolcanicActivityData() {
  await delay(300);

  const features = VOLCANOES.map((v) => {
    const alertLevel = Math.random();
    const level =
      alertLevel < 0.3 ? "normal" :
      alertLevel < 0.6 ? "advisory" :
      alertLevel < 0.85 ? "watch" : "warning";
    const impactRadiusKm = randomInRange(5, 50);

    return pointFeature(v.lng, v.lat, {
      id: `volc-${v.name}`,
      name: v.name,
      country: v.country,
      alertLevel: level,
      impactRadiusKm: Math.round(impactRadiusKm),
      lastEruption: `${Math.floor(randomInRange(1, 200))} лет назад`,
      seismicEvents24h: Math.floor(randomInRange(0, 50)),
      so2EmissionTonnes: Math.round(randomInRange(50, 5000)),
      label: v.name,
    });
  });

  return featureCollection(features);
}

// ─────────────────────────────────────────────────────────────
// Генератор локальной статистики (для пользовательской геолокации)
// ─────────────────────────────────────────────────────────────
export async function fetchLocalStats(lat, lng) {
  await delay(600);

  const aqi = Math.round(randomInRange(15, 180));
  const seismicRisk = randomInRange(0, 1);

  return {
    aqi,
    aqiCategory:
      aqi <= 50 ? "good" :
      aqi <= 100 ? "moderate" :
      aqi <= 150 ? "unhealthy_sensitive" : "unhealthy",
    aqiLabel:
      aqi <= 50 ? "Хорошее" :
      aqi <= 100 ? "Умеренное" :
      aqi <= 150 ? "Нездоровое для чувств. групп" : "Нездоровое",
    seismicThreat: Math.round(seismicRisk * 100) / 100,
    seismicLabel:
      seismicRisk < 0.2 ? "Минимальная" :
      seismicRisk < 0.5 ? "Низкая" :
      seismicRisk < 0.7 ? "Умеренная" : "Высокая",
    weatherAnomalies: {
      heatwave: Math.random() > 0.7,
      frost: Math.random() > 0.8,
      drought: Math.random() > 0.75,
      flooding: Math.random() > 0.85,
    },
    temperature: Math.round(randomInRange(-10, 40)),
    humidity: Math.round(randomInRange(20, 95)),
    windSpeed: Math.round(randomInRange(0, 20) * 10) / 10,
    nearestVolcanoKm: Math.round(randomInRange(50, 2000)),
    fireRiskIndex: Math.round(randomInRange(0, 100)),
    coordinates: { lat: Math.round(lat * 1000) / 1000, lng: Math.round(lng * 1000) / 1000 },
  };
}

// ─────────────────────────────────────────────────────────────
// Генератор данных для отчетов (для страницы сравнительного отчета)
// ─────────────────────────────────────────────────────────────
export async function fetchReportData(points) {
  await delay(800);

  return points.map((point, idx) => ({
    id: point.id || `point-${idx}`,
    lat: point.lat,
    lng: point.lng,
    label: point.label || `Точка ${idx + 1}`,
    stats: {
      aqi: Math.round(randomInRange(15, 200)),
      seismicRisk: Math.round(randomInRange(0, 100)),
      fireRisk: Math.round(randomInRange(0, 100)),
      floodRisk: Math.round(randomInRange(0, 100)),
      volcanicRisk: Math.round(randomInRange(0, 100)),
      waveHeight: Math.round(randomInRange(0, 6) * 10) / 10,
      windSpeed: Math.round(randomInRange(0, 30) * 10) / 10,
      temperature: Math.round(randomInRange(-20, 45)),
      humidity: Math.round(randomInRange(10, 100)),
      overallRisk: Math.round(randomInRange(0, 100)),
    },
    monthlyData: Array.from({ length: 12 }, (_, m) => ({
      month: ["Янв", "Фев", "Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек"][m],
      temperature: Math.round(randomInRange(-15, 40)),
      precipitation: Math.round(randomInRange(5, 200)),
      aqi: Math.round(randomInRange(20, 180)),
    })),
  }));
}
