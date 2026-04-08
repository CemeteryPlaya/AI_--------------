"""
Chat API — POST /api/chat

Принимает координаты пользователя, его вопрос и историю диалога.
Агрегирует live-данные (погода, AQI, землетрясения, пожары, вулканы, ветер),
строит контекстный промпт и вызывает Climate Intel AI (Claude).
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.services.chat import run_chat

router = APIRouter(prefix="/api", tags=["Climate Intel AI"])


class ChatMessage(BaseModel):
    role: str = Field(..., pattern="^(user|assistant)$")
    content: str


class ChatRequest(BaseModel):
    lat: float = Field(..., ge=-90, le=90, description="Latitude")
    lon: float = Field(..., ge=-180, le=180, description="Longitude")
    query: str = Field(..., min_length=1, max_length=2000, description="User's question")
    chat_history: list[ChatMessage] = Field(
        default_factory=list,
        max_length=20,
        description="Previous turns (up to 20 messages)",
    )


@router.post("/chat", summary="Climate Intel AI chat")
async def chat(req: ChatRequest):
    """
    Анализирует климатические риски для заданных координат и отвечает на вопрос пользователя.

    - Агрегирует данные из OpenWeatherMap, USGS, NASA FIRMS, NASA EONET и Open-Meteo.
    - Вычисляет ML-оценки рисков (пожар, паводок, тепловой стресс, сейсмика).
    - Передаёт весь контекст модели Claude и возвращает её ответ.
    """
    try:
        result = await run_chat(
            lat=req.lat,
            lon=req.lon,
            query=req.query,
            chat_history=[m.model_dump() for m in req.chat_history],
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    return result
