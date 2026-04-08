"use client";

import { useAppState, useAppActions } from "@/lib/store";
import { useI18n } from "@/lib/i18n";

export default function PinDetailPanel() {
  const { activePin, selectedPoints } = useAppState();
  const { clearActivePin, addSelectedPoint, removeSelectedPoint } = useAppActions();
  const { lang } = useI18n();
  const isRu = lang === "ru";

  if (!activePin) return null;

  const isAlreadySelected = selectedPoints.some((p) => p.id === activePin.id);
  const canAdd = selectedPoints.length < 5 && !isAlreadySelected;

  const handleAddToComparison = () => {
    if (canAdd) {
      addSelectedPoint({
        lat: activePin.lat,
        lng: activePin.lng,
        id: activePin.id,
        label: `#${selectedPoints.length + 1}`,
      });
    }
  };

  const handleRemoveFromComparison = () => {
    removeSelectedPoint(activePin.id);
  };

  const climateZone =
    activePin.lat > 55
      ? isRu
        ? "Субарктическая"
        : "Subarctic"
      : activePin.lat > 40
      ? isRu
        ? "Умеренная"
        : "Temperate"
      : activePin.lat > 23
      ? isRu
        ? "Субтропическая"
        : "Subtropical"
      : isRu
      ? "Тропическая"
      : "Tropical";

  return (
    <div className="glass-card pin-detail-panel">
      <div className="glass-card-title">
        <span className="icon">📌</span>
        {isRu ? "Выбранная точка" : "Selected point"}
        <button
          className="pin-detail-close"
          onClick={clearActivePin}
          title={isRu ? "Закрыть" : "Close"}
        >
          ✕
        </button>
      </div>

      <div className="pin-detail-coords">
        <div className="pin-detail-coord-row">
          <span className="pin-detail-coord-label">{isRu ? "Широта" : "Latitude"}</span>
          <span className="pin-detail-coord-value">{activePin.lat.toFixed(5)}</span>
        </div>
        <div className="pin-detail-coord-row">
          <span className="pin-detail-coord-label">{isRu ? "Долгота" : "Longitude"}</span>
          <span className="pin-detail-coord-value">{activePin.lng.toFixed(5)}</span>
        </div>
      </div>

      <div className="pin-detail-section">
        <div className="pin-detail-section-title">
          {isRu ? "Информация о зоне" : "Area information"}
        </div>
        <div className="pin-detail-row">
          <span>{isRu ? "Климатическая зона" : "Climate zone"}</span>
          <span>{climateZone}</span>
        </div>
        <div className="pin-detail-row">
          <span>{isRu ? "Удалённость от побережья" : "Distance to coastline"}</span>
          <span>
            {Math.round(Math.abs(activePin.lng % 40) * 10)} {isRu ? "км" : "km"}
          </span>
        </div>
        <div className="pin-detail-row">
          <span>{isRu ? "Высота над ур. моря" : "Elevation above sea level"}</span>
          <span>
            {Math.round(Math.abs((activePin.lat * activePin.lng) % 1500))} {isRu ? "м" : "m"}
          </span>
        </div>
      </div>

      <div className="pin-detail-actions">
        {isAlreadySelected ? (
          <button
            className="btn btn-secondary btn-sm"
            onClick={handleRemoveFromComparison}
          >
            {isRu ? "Убрать из сравнения" : "Remove from comparison"}
          </button>
        ) : (
          <button
            className="btn btn-primary btn-sm"
            onClick={handleAddToComparison}
            disabled={!canAdd}
            title={!canAdd ? (isRu ? "Максимум 5 точек" : "Maximum 5 points") : ""}
          >
            {isRu ? "Добавить к сравнению" : "Add to comparison"} ({selectedPoints.length}/5)
          </button>
        )}
      </div>
    </div>
  );
}

