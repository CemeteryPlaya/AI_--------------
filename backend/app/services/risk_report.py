"""
Сервис отчетов о рисках — перевод финансовых климатических рисков с помощью LLM.

Этот модуль содержит системный промпт и функцию-заглушку для генерации 
отчетов о рисках, соответствующих стандартам ESG, на основе сырых данных о климатических угрозах.

Интеграция с OpenAI / Anthropic API должна быть добавлена при готовности.
"""

import json
from pathlib import Path
from typing import Any

# Загрузка системного промпта из файла
PROMPT_PATH = Path(__file__).parent.parent / "prompts" / "financial_translator.txt"
SYSTEM_PROMPT = PROMPT_PATH.read_text(encoding="utf-8") if PROMPT_PATH.exists() else ""


def build_report_prompt(asset_data: dict[str, Any]) -> list[dict[str, str]]:
    """
    Build the message payload for the LLM API call.

    Args:
        asset_data: Dictionary containing spatial asset information and
                    probabilistic climate projections.

    Returns:
        A list of message dicts ready for OpenAI/Anthropic API format.
    """
    return [
        {"role": "system", "content": SYSTEM_PROMPT},
        {
            "role": "user",
            "content": (
                "Please analyze the following asset data and generate a comprehensive "
                "climate risk report with financial translation.\n\n"
                f"```json\n{json.dumps(asset_data, indent=2, default=str)}\n```"
            ),
        },
    ]


async def generate_risk_report(asset_data: dict[str, Any]) -> dict[str, Any]:
    """
    Generate a climate risk report for the given asset.

    Currently returns a structured stub response. Replace with actual
    LLM API call (OpenAI/Anthropic) when API keys are configured.

    Args:
        asset_data: Asset data including location, properties, and
                    climate projections.

    Returns:
        A dictionary containing the risk assessment report.
    """
    messages = build_report_prompt(asset_data)

    # ──────────────────────────────────────────────────────────────
    # TODO: Replace stub with actual LLM API call
    #
    # Example with OpenAI:
    #   from openai import AsyncOpenAI
    #   client = AsyncOpenAI(api_key=settings.openai_api_key)
    #   response = await client.chat.completions.create(
    #       model="gpt-4",
    #       messages=messages,
    #       temperature=0.2,
    #   )
    #   return {"report": response.choices[0].message.content}
    #
    # Example with Anthropic:
    #   from anthropic import AsyncAnthropic
    #   client = AsyncAnthropic(api_key=settings.anthropic_api_key)
    #   response = await client.messages.create(
    #       model="claude-sonnet-4-20250514",
    #       system=SYSTEM_PROMPT,
    #       messages=[messages[1]],
    #       max_tokens=4096,
    #   )
    #   return {"report": response.content[0].text}
    # ──────────────────────────────────────────────────────────────

    asset_name = asset_data.get("name", "Unknown Asset")
    asset_location = asset_data.get("location", "Unknown Location")

    return {
        "status": "stub",
        "message": (
            "Risk report generation is configured but requires an LLM API key. "
            "Set OPENAI_API_KEY or ANTHROPIC_API_KEY in your environment."
        ),
        "asset": asset_name,
        "location": asset_location,
        "prompt_preview": {
            "system_prompt_length": len(SYSTEM_PROMPT),
            "user_message_length": len(messages[1]["content"]),
        },
        "sample_report": {
            "financial_translation": {
                "cvar_95th_percentile": "Pending LLM analysis",
                "direct_physical_damage_capex": "Pending LLM analysis",
                "business_interruption_opex": "Pending LLM analysis",
            },
            "regulatory_alignment_csrd_esrs_e1": "Pending LLM analysis",
            "adaptation_strategies": [
                "Pending LLM analysis — flood barriers",
                "Pending LLM analysis — HVAC upgrades",
                "Pending LLM analysis — structural reinforcement",
            ],
        },
    }
