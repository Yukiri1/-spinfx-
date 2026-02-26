from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, HttpUrl

from app.config import settings
from app.services.youtube import enqueue_ingest

app = FastAPI(title="ClipCraft API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class IngestRequest(BaseModel):
    url: HttpUrl


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/api/ingest")
def ingest(request: IngestRequest) -> dict:
    return enqueue_ingest(str(request.url))
