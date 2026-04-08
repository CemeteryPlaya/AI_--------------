"""Pydantic schemas for Asset API request/response validation."""

from pydantic import BaseModel, Field
from typing import Optional, Any
from datetime import datetime
from uuid import UUID


class AssetBase(BaseModel):
    """Base schema for asset data."""
    name: Optional[str] = None
    asset_type: Optional[str] = None
    description: Optional[str] = None
    properties: Optional[dict[str, Any]] = None


class AssetResponse(AssetBase):
    """Single asset response schema."""
    id: UUID
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class AssetUploadResponse(BaseModel):
    """Response after uploading a GeoJSON file."""
    message: str
    total_features: int = Field(..., description="Number of features processed")
    assets_created: int = Field(..., description="Number of assets saved to DB")
    errors: list[str] = Field(default_factory=list, description="Any validation errors")


class GeoJSONFeature(BaseModel):
    """Schema representing a single GeoJSON Feature."""
    type: str = "Feature"
    geometry: dict[str, Any]
    properties: Optional[dict[str, Any]] = None


class GeoJSONFeatureCollection(BaseModel):
    """Schema representing a GeoJSON FeatureCollection."""
    type: str = "FeatureCollection"
    features: list[GeoJSONFeature]
