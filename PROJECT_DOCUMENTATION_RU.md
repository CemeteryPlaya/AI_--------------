# Полная Документация Проекта (RU)

## 1. Что это за проект

**Climate Risk Intelligence** — веб-платформа для анализа климатических рисков на карте:
- загрузка активов (GeoJSON) в PostGIS,
- визуализация слоев рисков (землетрясения, пожары, волны, ветер, вулканы),
- локальная сводка по координатам (погода, AQI, аномалии),
- ML-прогноз через ONNX-модель,
- сравнительный отчет по выбранным точкам.

---

## 2. Архитектура на высоком уровне

Система состоит из 4 сервисов в `docker-compose`:
- `db` — PostgreSQL + PostGIS,
- `minio` — S3-совместимое object storage,
- `backend` — FastAPI,
- `frontend` — Next.js + deck.gl + MapLibre.

Основные потоки:
1. Пользователь включает слой на фронтенде.
2. Фронтенд вызывает backend (`/api/layers/*`, `/api/weather`, `/api/local-stats` и т.д.).
3. Backend проксирует запрос к внешним API (USGS, NASA FIRMS, NASA EONET, Open-Meteo, OpenWeatherMap), нормализует ответ в GeoJSON/JSON и кэширует.
4. Фронтенд строит deck.gl-слои и рендерит карту.

---

## 3. Полное дерево файлов проекта (без `node_modules`, `.venv`, `__pycache__`)

```text
.
├─ docker-compose.yml
├─ README.md
├─ tiny_flood_mlp.py
├─ tiny_flood_model.onnx
├─ tiny_flood_model.onnx.data
├─ tiny_flood_model.pt
├─ data/
│  ├─ climate_change_impact_on_agriculture_2024.csv
│  ├─ climate_disease_dataset.csv
│  ├─ company_esg_financial_dataset.csv
│  ├─ Crop_Yield_Prediction.csv
│  ├─ global_deforestation_2000_2025.csv
│  ├─ global_population_risk.csv
│  ├─ Greenwashing_Score_Data.xlsx
│  ├─ population_goods_resources.csv
│  ├─ population_growth.csv
│  └─ population_ozone_environment.csv
├─ backend/
│  ├─ Dockerfile
│  ├─ requirements.txt
│  ├─ sample_assets.geojson
│  ├─ alembic.ini
│  ├─ alembic/
│  │  └─ env.py
│  └─ app/
│     ├─ __init__.py
│     ├─ main.py
│     ├─ config.py
│     ├─ database.py
│     ├─ models/
│     │  ├─ __init__.py
│     │  └─ asset.py
│     ├─ schemas/
│     │  ├─ __init__.py
│     │  └─ asset.py
│     ├─ services/
│     │  ├─ __init__.py
│     │  ├─ recommendations.py
│     │  └─ risk_report.py
│     ├─ prompts/
│     │  └─ financial_translator.txt
│     └─ api/
│        ├─ __init__.py
│        ├─ assets.py
│        ├─ city_guide.py
│        ├─ local_stats.py
│        ├─ predict.py
│        ├─ realtime_layers.py
│        ├─ report.py
│        └─ weather.py
└─ frontend/
   ├─ Dockerfile
   ├─ package.json
   ├─ package-lock.json
   ├─ next.config.mjs
   ├─ eslint.config.mjs
   ├─ jsconfig.json
   ├─ postcss.config.mjs
   ├─ README.md
   ├─ CLAUDE.md
   ├─ AGENTS.md
   └─ src/
      ├─ app/
      │  ├─ globals.css
      │  ├─ layout.js
      │  ├─ page.js
      │  └─ report/
      │     └─ page.js
      ├─ lib/
      │  ├─ geolocation.js
      │  ├─ layerFactory.js
      │  ├─ mockData.js
      │  ├─ realtimeData.js
      │  └─ store.js
      └─ components/
         ├─ CityAirGuide.jsx
         ├─ DeckGLOverlay.jsx
         ├─ FloodRiskPanel.jsx
         ├─ GeoLocationWidget.jsx
         ├─ LayerControl.jsx
         ├─ MapView.jsx
         ├─ PinDetailPanel.jsx
         ├─ ReportView.jsx
         ├─ Sidebar.jsx
         ├─ TinyMLPanel.jsx
         ├─ UploadPanel.jsx
         └─ WeatherLayer.jsx
```

---

## 4. Инфраструктура и запуск

### 4.1 Docker Compose
- Файл: `docker-compose.yml`
- Поднимает все сервисы одной командой:

```bash
docker compose up --build
```

### 4.2 Порты
- Frontend: `http://localhost:3000`
- Backend API: `http://localhost:8000`
- Swagger: `http://localhost:8000/docs`
- MinIO Console: `http://localhost:9001`
- PostGIS: `localhost:5432`

### 4.3 Ключевые env-переменные
- `DATABASE_URL`, `DATABASE_URL_SYNC`
- `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`
- `OPENWEATHER_API_KEY`
- `CORS_ORIGINS`
- `NEXT_PUBLIC_API_URL`
- `S3_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET_NAME`

---

## 5. Backend: детальное описание

### 5.1 Точка входа и lifecycle
- `backend/app/main.py`
  - создает FastAPI-приложение,
  - подключает CORS,
  - регистрирует роутеры,
  - на старте:
    - инициализирует БД/PostGIS,
    - загружает ML-модель и scaler.

### 5.2 Конфигурация
- `backend/app/config.py`
  - `Settings` (pydantic-settings),
  - чтение `.env`,
  - `get_settings()` с кэшированием через `lru_cache`.

### 5.3 База данных
- `backend/app/database.py`
  - async SQLAlchemy engine + sessionmaker,
  - `get_db()` (commit/rollback lifecycle),
  - `init_db()`:
    - `CREATE EXTENSION IF NOT EXISTS postgis`,
    - `Base.metadata.create_all`.

### 5.4 ORM и схемы
- `backend/app/models/asset.py` — модель `Asset` (UUID, JSONB, Geometry).
- `backend/app/schemas/asset.py` — pydantic-схемы для upload/response.

### 5.5 API-эндпоинты

#### Assets (`backend/app/api/assets.py`)
- `POST /api/upload-assets` — загрузка GeoJSON FeatureCollection.
- `GET /api/assets` — список активов как GeoJSON.
- `GET /api/assets/{asset_id}` — один актив.
- `DELETE /api/assets/{asset_id}` — удаление.

#### Weather (`backend/app/api/weather.py`)
- `GET /api/weather?lat&lon&zoom`
- Источник: OpenWeatherMap `find`.
- Возврат: GeoJSON точек с `temp`, `wind_*`, `icon_url`, `color`.
- In-memory cache: 10 минут.

#### Real-time layers (`backend/app/api/realtime_layers.py`)
- `GET /api/layers/earthquakes` — USGS.
- `GET /api/layers/wildfires` — NASA FIRMS CSV (Global 24h).
- `GET /api/layers/volcanoes` — NASA EONET.
- `GET /api/layers/wind` — Open-Meteo.
- `GET /api/layers/waves` — Open-Meteo Marine.
- Общий cache: 5 минут.

#### Local stats (`backend/app/api/local_stats.py`)
- `GET /api/local-stats?lat&lon`
- Источники:
  - OpenWeatherMap `weather`,
  - OpenWeatherMap `air_pollution`.
- Доп. вычисления:
  - эвристический `seismicThreat`,
  - флаги погодных аномалий.

#### City guide (`backend/app/api/city_guide.py`)
- `GET /api/city-air-guide?lat&lon`
- Сводка:
  - погода,
  - AQI и компоненты,
  - рекомендации из `services/recommendations.py`.

#### Predict (`backend/app/api/predict.py`)
- `POST /api/predict`
- Вход: `features` (строго 10 чисел).
- Использует ONNX Runtime + StandardScaler.
- Возврат: `prediction`, unit, метаданные.

#### Reports (`backend/app/api/report.py`)
- `POST /api/report/create`
- `GET /api/report/{session_id}`
- Сейчас: mock-сессии в памяти с TTL 1 час.

#### LLM report (`main.py` + `services/risk_report.py`)
- `POST /api/generate-report`
- Пока возвращает stub (подготовка промпта есть, реальный вызов LLM не подключен).

### 5.6 Сервисы
- `backend/app/services/recommendations.py`
  - rule-based рекомендации (одежда, советы по AQI/погоде).
- `backend/app/services/risk_report.py`
  - загрузка системного промпта,
  - формирование payload для будущего LLM.

### 5.7 Миграции
- `backend/alembic/env.py` настроен на async SQLAlchemy и metadata из моделей.

---

## 6. Frontend: детальное описание

### 6.1 Приложение и маршруты
- `frontend/src/app/layout.js` — root layout.
- `frontend/src/app/page.js` — главная страница карты.
- `frontend/src/app/report/page.js` — страница сравнительного отчета по query `points`.
- `frontend/src/app/globals.css` — полный дизайн-системный стиль.

### 6.2 Глобальное состояние
- `frontend/src/lib/store.js`
  - Context + reducer.
  - Хранит:
    - `activePin`,
    - `selectedPoints` (до 5),
    - toggles слоев,
    - `userLocation`,
    - `localStats`,
    - текущую панель sidebar.

### 6.3 Карта и слои
- `frontend/src/components/MapView.jsx`
  - MapLibre + DeckGLOverlay.
  - Грузит слои по включенным чекбоксам.
  - Автообновляет активные слои каждые 5 минут.
  - Перезагружает viewport-зависимые слои при окончании движения карты.
  - Обрабатывает:
    - click (pin),
    - Shift+click (добавление в сравнение).

- `frontend/src/components/DeckGLOverlay.jsx`
  - интеграция deck.gl через `MapboxOverlay`.

- `frontend/src/lib/realtimeData.js`
  - функции загрузки слоев из backend (`/api/layers/*`).

- `frontend/src/lib/layerFactory.js`
  - преобразует GeoJSON в deck.gl-слои:
    - Scatterplot,
    - Text,
    - Heatmap.

- `frontend/src/components/WeatherLayer.jsx`
  - отдельный погодный слой:
    - запрос в `/api/weather`,
    - debounce,
    - abort прошлых запросов,
    - weather tooltip.

### 6.4 Sidebar и панели
- `Sidebar.jsx` — сборка боковой колонки.
- `LayerControl.jsx` — менеджер слоев.
- `GeoLocationWidget.jsx` — разрешение геолокации + `/api/local-stats`.
- `CityAirGuide.jsx` — карточка по выбранной точке + `/api/city-air-guide`.
- `PinDetailPanel.jsx` — детали выбранной точки.
- `TinyMLPanel.jsx` — форма 10 параметров -> `/api/predict`.
- `FloodRiskPanel.jsx` — альтернативная UI-форма -> `/api/predict`.
- `UploadPanel.jsx` — загрузка GeoJSON -> `/api/upload-assets`.

### 6.5 Отчет
- `ReportView.jsx` — визуализация comparative report.
- Сейчас использует `frontend/src/lib/mockData.js` (`fetchReportData`) вместо backend report API.

---

## 7. Данные в реальном времени vs mock

### Реальные источники
- USGS — землетрясения.
- NASA FIRMS — пожары.
- NASA EONET — вулканы.
- Open-Meteo / Open-Meteo Marine — ветер и волны.
- OpenWeatherMap — погода и качество воздуха.

### Не полностью real-time
- На фронте автообновление каждые 5 минут.
- На backend есть in-memory cache 5–10 минут.

### Mock / stub участки
- `frontend/lib/mockData.js` — генератор mock-данных отчета.
- `backend/api/report.py` — in-memory mock отчетов.
- `backend/services/risk_report.py` — stub для LLM-отчета.

---

## 8. ML-часть (Tiny Flood)

### Артефакты
- `tiny_flood_model.onnx`
- `tiny_flood_model.onnx.data`
- `tiny_flood_model.pt`

### Скрипт обучения
- `tiny_flood_mlp.py`
  - подготовка датасета,
  - обучение компактного MLP,
  - оценка,
  - экспорт в ONNX.

### Runtime inference
- `backend/app/api/predict.py`
  - загружает ONNX,
  - поднимает scaler на данных из `/data`,
  - выдает prediction через ONNXRuntime.

---

## 9. Внешние API, которые использует проект

- `https://earthquake.usgs.gov/...` (USGS feeds)
- `https://firms.modaps.eosdis.nasa.gov/...` (NASA FIRMS CSV)
- `https://eonet.gsfc.nasa.gov/api/v3/events` (NASA EONET)
- `https://api.open-meteo.com/v1/forecast`
- `https://marine-api.open-meteo.com/v1/marine`
- `https://api.openweathermap.org/data/2.5/find`
- `https://api.openweathermap.org/data/2.5/weather`
- `http://api.openweathermap.org/data/2.5/air_pollution`

---

## 10. Известные ограничения/особенности

1. Часть отчетов сейчас mock (frontend и отдельный backend report API).
2. LLM-отчет (`/api/generate-report`) пока заглушка.
3. В `config.py` поле `openweather_api_key` объявлено дважды (технический дубликат).
4. `TinyMLPanel` и `FloodRiskPanel` используют один и тот же endpoint `/api/predict`, хотя бизнес-семантика полей разная.
5. Кэш in-memory сбрасывается при рестарте backend-контейнера.

---

## 11. Где и что менять (быстрый навигатор)

- Добавить новый слой карты:  
  1) backend: `backend/app/api/realtime_layers.py`  
  2) frontend fetch: `frontend/src/lib/realtimeData.js`  
  3) frontend rendering: `frontend/src/lib/layerFactory.js`  
  4) toggle: `frontend/src/components/LayerControl.jsx` + `frontend/src/lib/store.js`

- Изменить бизнес-логику рекомендаций:  
  `backend/app/services/recommendations.py`

- Подключить реальный LLM-генератор отчета:  
  `backend/app/services/risk_report.py`

- Изменить стили интерфейса:  
  `frontend/src/app/globals.css`

- Изменить общий state и действия приложения:  
  `frontend/src/lib/store.js`

---

## 12. Краткий итог по проекту

Проект уже содержит:
- рабочий geospatial backend (FastAPI + PostGIS),
- визуальную карту с несколькими реальными источниками данных,
- панели геолокации, AQI, weather, слои рисков,
- ML-инференс через ONNX,
- базу для сравнительных отчетов.

Основные зоны доработки:
- убрать mock в отчетах,
- довести LLM-отчет до production,
- унифицировать ML-входы и бизнес-смысл полей.

