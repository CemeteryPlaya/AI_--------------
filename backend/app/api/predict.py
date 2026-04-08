"""
TinyML Predict API — эндпоинт POST /api/predict для модели наводнений (948 параметров).

Загружает модель tiny_flood_model.onnx при запуске, принимает 10 признаков, возвращает предсказание.
"""

import logging
import pathlib

import numpy as np
import pandas as pd
import onnxruntime as ort
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from sklearn.preprocessing import StandardScaler
from sklearn.impute import SimpleImputer

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["TinyML Predict"])

# ── Paths ─────────────────────────────────────────────────────
MODEL_PATH = pathlib.Path("/models/tiny_flood_model.onnx")
DATA_DIR = pathlib.Path("/data")

# ── Метаданные признаков (строго в том порядке, как обучали модель) ─────────
FEATURE_NAMES = [
    "Year",
    "Average_Temperature_C",
    "Total_Precipitation_mm",
    "CO2_Emissions_MT",
    "Crop_Yield_MT_per_HA",
    "Extreme_Weather_Events",
    "Irrigation_Access_%",
    "Pesticide_Use_KG_per_HA",
    "Fertilizer_Use_KG_per_HA",
    "Soil_Health_Index",
]

N_FEATURES = len(FEATURE_NAMES)
TOTAL_PARAMS = 948


# ── Глобальное состояние (загружается только один раз при запуске приложения) ──
_session: ort.InferenceSession | None = None
_scaler: StandardScaler | None = None


def load_model_and_scaler():
    """Загрузить ONNX модель и обучить scaler (масштабировщик) на тренировочных данных."""
    global _session, _scaler

    if not MODEL_PATH.exists():
        raise FileNotFoundError(f"Model file not found: {MODEL_PATH}")

    # Load ONNX model
    _session = ort.InferenceSession(str(MODEL_PATH))
    logger.info(f"ONNX model loaded from {MODEL_PATH}")

    # Обучение масштабировщика (scaler) на обучающих данных (точно так же, как в скрипте обучения)
    target_csv = DATA_DIR / "climate_change_impact_on_agriculture_2024.csv"
    if not target_csv.exists():
        csv_files = sorted(DATA_DIR.glob("*.csv"))
        if not csv_files:
            raise FileNotFoundError(f"No CSV files found in {DATA_DIR} for scaler fitting")
        target_csv = csv_files[0]

    df = pd.read_csv(target_csv)
    if "id" in df.columns:
        df = df.drop(columns=["id"])

    target_col = "Economic_Impact_Million_USD"
    if target_col not in df.columns:
        numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
        target_col = numeric_cols[-1]

    X = df.drop(columns=[target_col])
    numeric_cols = X.select_dtypes(include=[np.number]).columns.tolist()
    X = X[numeric_cols].values.astype(np.float32)

    imputer = SimpleImputer(strategy="median")
    X = imputer.fit_transform(X)

    _scaler = StandardScaler()
    _scaler.fit(X)

    logger.info(f"Scaler fitted on {X.shape[0]} samples, {X.shape[1]} features")


# ── Схемы данных для Запросов / Ответов ───────────────────────────────────────
class PredictRequest(BaseModel):
    features: list[float] = Field(
        ...,
        min_length=N_FEATURES,
        max_length=N_FEATURES,
        description=f"Массив из {N_FEATURES} числовых значений признаков",
    )


class PredictResponse(BaseModel):
    prediction: float
    unit: str = "Million USD"
    params: int = TOTAL_PARAMS
    feature_names: list[str] = FEATURE_NAMES


# ── Endpoint ──────────────────────────────────────────────────
@router.post(
    "/predict",
    response_model=PredictResponse,
    summary="Run TinyML flood impact prediction",
    description=(
        f"Accepts {N_FEATURES} numeric features and returns the predicted "
        "economic impact using the 948-parameter TinyFloodMLP model."
    ),
)
async def predict(req: PredictRequest):
    if _session is None or _scaler is None:
        raise HTTPException(status_code=503, detail="Model not loaded yet")

    # Scale input features
    raw = np.array(req.features, dtype=np.float32).reshape(1, -1)
    scaled = _scaler.transform(raw).astype(np.float32)

    # ONNX inference
    input_name = _session.get_inputs()[0].name
    result = _session.run(None, {input_name: scaled})
    prediction = float(result[0].flatten()[0])

    return PredictResponse(prediction=round(prediction, 4))
