# Climate Risk Intelligence Platform

> Cloud-Native B2B SaaS for climate risk intelligence. Predicts physical climate risks (floods, wildfires) for corporate real estate portfolios and translates them into financial metrics (Expected Loss, CVaR).

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   Docker Compose Network                     │
│                                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────────┐  │
│  │ PostGIS  │  │  MinIO   │  │ FastAPI  │  │  Next.js   │  │
│  │ :5432    │  │ :9000/01 │  │ :8000    │  │  :3000     │  │
│  │ Database │  │    S3    │  │ Backend  │  │  Frontend  │  │
│  └──────────┘  └──────────┘  └──────────┘  └────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Quick Start

### Prerequisites
- Docker Desktop installed and running

### Launch

```bash
# Clone and start all services
docker compose up --build

# Services will be available at:
# Frontend:     http://localhost:3000
# Backend API:  http://localhost:8000
# API Docs:     http://localhost:8000/docs
# MinIO:        http://localhost:9001
```

### Test Upload

```bash
# Upload the sample GeoJSON file
curl -X POST http://localhost:8000/api/upload-assets \
  -F "file=@backend/sample_assets.geojson"

# Retrieve all assets as GeoJSON
curl http://localhost:8000/api/assets
```

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Database | PostgreSQL + PostGIS | Spatial queries & storage |
| Backend | FastAPI + SQLAlchemy + GeoAlchemy2 | REST API + ORM |
| Geospatial | Shapely + GeoPandas + Dask | Geometry processing |
| Frontend | Next.js + deck.gl + MapLibre GL | 3D map visualization |
| Storage | MinIO (S3-compatible) | COG/Zarr file storage |
| Infra | Docker Compose | Local orchestration |

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/upload-assets` | Upload GeoJSON FeatureCollection |
| `GET`  | `/api/assets` | Get all assets as GeoJSON |
| `GET`  | `/api/assets/{id}` | Get single asset |
| `DELETE`| `/api/assets/{id}` | Delete asset |
| `POST` | `/api/generate-report` | Generate LLM risk report |
| `GET`  | `/health` | Health check |
| `GET`  | `/docs` | Swagger UI |

## Project Structure

```
├── docker-compose.yml
├── .env
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── app/
│   │   ├── main.py          # FastAPI entry point
│   │   ├── config.py         # Settings
│   │   ├── database.py       # Async SQLAlchemy
│   │   ├── models/asset.py   # PostGIS model
│   │   ├── schemas/asset.py  # Pydantic schemas
│   │   ├── api/assets.py     # CRUD endpoints
│   │   ├── services/risk_report.py
│   │   └── prompts/financial_translator.txt
│   └── sample_assets.geojson
└── frontend/
    ├── Dockerfile
    ├── src/
    │   ├── app/
    │   │   ├── page.js        # Main page
    │   │   ├── layout.js      # Root layout
    │   │   └── globals.css    # Design system
    │   └── components/
    │       ├── MapView.jsx    # deck.gl + MapLibre
    │       ├── DeckGLOverlay.jsx
    │       ├── Sidebar.jsx
    │       └── UploadPanel.jsx
```

## License

Proprietary — All rights reserved.
