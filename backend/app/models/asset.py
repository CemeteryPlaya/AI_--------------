"""Asset model — building footprints stored with PostGIS geometry."""

import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, String, DateTime, Text
from sqlalchemy.dialects.postgresql import UUID, JSONB
from geoalchemy2 import Geometry

from app.database import Base


class Asset(Base):
    """
    Represents a physical asset (building, warehouse, etc.) with its
    geographic footprint stored as a PostGIS geometry.
    """

    __tablename__ = "assets"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        index=True,
    )
    name = Column(String(255), nullable=True, index=True)
    asset_type = Column(String(100), nullable=True, index=True)
    description = Column(Text, nullable=True)
    properties = Column(JSONB, nullable=True, default=dict)
    geometry = Column(
        Geometry(
            geometry_type="GEOMETRY",
            srid=4326,
            spatial_index=True,
        ),
        nullable=False,
    )
    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    def __repr__(self):
        return f"<Asset(id={self.id}, name={self.name}, type={self.asset_type})>"
