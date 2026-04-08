"""
API для работы с активами — загрузка GeoJSON, получение активов в формате FeatureCollection.
"""

import json
import logging
from uuid import UUID

from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from geoalchemy2.functions import ST_AsGeoJSON, ST_Transform
from shapely.geometry import shape, mapping
from shapely.validation import explain_validity

from app.database import get_db
from app.models.asset import Asset
from app.schemas.asset import AssetUploadResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["Assets"])


@router.post(
    "/upload-assets",
    response_model=AssetUploadResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Upload building footprints as GeoJSON",
    description="Accepts a GeoJSON FeatureCollection file, validates geometries, "
                "and stores each feature as an asset in the PostGIS database.",
)
async def upload_assets(
    file: UploadFile = File(
        ...,
        description="A .geojson or .json file containing a GeoJSON FeatureCollection",
    ),
    db: AsyncSession = Depends(get_db),
):
    # ── Validate file type ──────────────────────────────────────
    if not file.filename.endswith((".geojson", ".json")):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File must be a .geojson or .json file.",
        )

    # ── Parse JSON content ──────────────────────────────────────
    try:
        content = await file.read()
        geojson_data = json.loads(content)
    except json.JSONDecodeError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid JSON: {str(e)}",
        )

    # ── Validate GeoJSON structure ──────────────────────────────
    if geojson_data.get("type") != "FeatureCollection":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="GeoJSON must be a FeatureCollection.",
        )

    features = geojson_data.get("features", [])
    if not features:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="FeatureCollection contains no features.",
        )

    # ── Process each feature ────────────────────────────────────
    created = 0
    errors = []

    for idx, feature in enumerate(features):
        try:
            # Validate geometry with Shapely
            geom = shape(feature.get("geometry", {}))

            if not geom.is_valid:
                reason = explain_validity(geom)
                errors.append(f"Feature {idx}: Invalid geometry — {reason}")
                # Attempt to fix with buffer(0)
                geom = geom.buffer(0)
                if not geom.is_valid:
                    continue

            props = feature.get("properties", {}) or {}

            asset = Asset(
                name=props.get("name") or props.get("Name") or f"Asset_{idx}",
                asset_type=props.get("asset_type") or props.get("type") or "building",
                description=props.get("description"),
                properties=props,
                geometry=f"SRID=4326;{geom.wkt}",
            )
            db.add(asset)
            created += 1

        except Exception as e:
            errors.append(f"Feature {idx}: {str(e)}")
            logger.warning(f"Failed to process feature {idx}: {e}")

    await db.flush()

    return AssetUploadResponse(
        message=f"Successfully processed {created} of {len(features)} features.",
        total_features=len(features),
        assets_created=created,
        errors=errors,
    )


@router.get(
    "/assets",
    summary="Get all assets as GeoJSON FeatureCollection",
    description="Returns all stored assets formatted as a valid GeoJSON FeatureCollection "
                "for direct consumption by deck.gl or any GeoJSON-compatible renderer.",
)
async def get_assets(db: AsyncSession = Depends(get_db)):
    """Return all assets as a GeoJSON FeatureCollection."""
    result = await db.execute(
        select(
            Asset.id,
            Asset.name,
            Asset.asset_type,
            Asset.description,
            Asset.properties,
            Asset.created_at,
            func.ST_AsGeoJSON(Asset.geometry).label("geojson"),
        ).order_by(Asset.created_at.desc())
    )
    rows = result.all()

    features = []
    for row in rows:
        geom = json.loads(row.geojson)
        feature = {
            "type": "Feature",
            "id": str(row.id),
            "geometry": geom,
            "properties": {
                "id": str(row.id),
                "name": row.name,
                "asset_type": row.asset_type,
                "description": row.description,
                **(row.properties or {}),
            },
        }
        features.append(feature)

    return {
        "type": "FeatureCollection",
        "features": features,
    }


@router.get(
    "/assets/{asset_id}",
    summary="Get a single asset by ID",
)
async def get_asset(asset_id: UUID, db: AsyncSession = Depends(get_db)):
    """Return a single asset as a GeoJSON Feature."""
    result = await db.execute(
        select(
            Asset.id,
            Asset.name,
            Asset.asset_type,
            Asset.description,
            Asset.properties,
            Asset.created_at,
            func.ST_AsGeoJSON(Asset.geometry).label("geojson"),
        ).where(Asset.id == asset_id)
    )
    row = result.first()

    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Asset {asset_id} not found.",
        )

    geom = json.loads(row.geojson)
    return {
        "type": "Feature",
        "id": str(row.id),
        "geometry": geom,
        "properties": {
            "id": str(row.id),
            "name": row.name,
            "asset_type": row.asset_type,
            "description": row.description,
            **(row.properties or {}),
        },
    }


@router.delete(
    "/assets/{asset_id}",
    summary="Delete an asset by ID",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_asset(asset_id: UUID, db: AsyncSession = Depends(get_db)):
    """Delete a single asset."""
    result = await db.execute(select(Asset).where(Asset.id == asset_id))
    asset = result.scalar_one_or_none()

    if not asset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Asset {asset_id} not found.",
        )

    await db.delete(asset)
