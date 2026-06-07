"""
backend/app.py — FastAPI entry point for the red-teaming engine web UI.

Run locally with:
    uvicorn backend.app:app --reload --port 8000

Exposed endpoints:
    GET  /api/categories                    → list all attack categories
    POST /api/campaigns                     → start a new campaign, return its id
    GET  /api/campaigns                     → list all campaigns (newest first)
    GET  /api/campaigns/{id}                → get one campaign (config, status, summary)
    GET  /api/campaigns/{id}/events (SSE)   → stream live progress events
"""

from __future__ import annotations

import asyncio
import json
from typing import Literal

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from attacker import AttackCategory

from backend.runner import (
    create_campaign,
    get_campaign,
    list_campaigns,
    subscribe_events,
)

app = FastAPI(title="Adversarial RAG Red-Teaming Engine")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],          # POC — lock down for production
    allow_methods=["*"],
    allow_headers=["*"],
)


class CampaignRequest(BaseModel):
    categories: list[str] = Field(..., min_length=1)
    attacks_per_category: int = Field(3, ge=0, le=20)
    include_seeds: bool = True
    concurrency: int = Field(3, ge=1, le=20)
    eval_concurrency: int = Field(3, ge=1, le=20)


@app.get("/api/categories")
def get_categories() -> list[str]:
    return [c.value for c in AttackCategory]


@app.post("/api/campaigns")
async def post_campaign(req: CampaignRequest) -> dict:
    # Validate categories
    valid = {c.value for c in AttackCategory}
    invalid = [c for c in req.categories if c not in valid]
    if invalid:
        raise HTTPException(400, f"Unknown categories: {', '.join(invalid)}")

    campaign_id = create_campaign(req.model_dump())
    return {"id": campaign_id}


@app.get("/api/campaigns")
def get_campaigns() -> list[dict]:
    return list_campaigns()


@app.get("/api/campaigns/{campaign_id}")
def get_campaign_detail(campaign_id: str) -> dict:
    c = get_campaign(campaign_id)
    if not c:
        raise HTTPException(404, "Campaign not found")
    return c


@app.get("/api/campaigns/{campaign_id}/events")
async def stream_events(campaign_id: str):
    c = get_campaign(campaign_id)
    if not c:
        raise HTTPException(404, "Campaign not found")

    async def event_generator():
        try:
            async for ev in subscribe_events(campaign_id):
                yield f"data: {json.dumps(ev)}\n\n"
            # Final marker so the client can cleanly close the EventSource
            yield f"data: {json.dumps({'type': 'stream_end'})}\n\n"
        except asyncio.CancelledError:
            return

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}
