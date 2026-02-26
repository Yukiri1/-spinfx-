# ClipCraft

ClipCraft is a full-stack starter for turning long YouTube videos into short social clips.

## Monorepo Layout

- `frontend/` — React + Vite UI for ingest, job status, and editing.
- `backend/` — FastAPI service for ingest orchestration, transcript + highlights APIs, and clip job management.
- `worker/` — background processor that executes queued clip generation tasks.
- `ai_pipeline/` — reusable Python modules for transcription, LLM highlight extraction, and FFmpeg render planning.

## Local Run Commands

### 1) Frontend (port `5173`)

```bash
cd frontend
pnpm install
pnpm dev
```

### 2) Backend API (port `8000`)

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 3) Worker / Queue processor

```bash
cd worker
python -m venv .venv
source .venv/bin/activate
pip install -r ../backend/requirements.txt
python main.py
```

> Queue backing store is Redis (`REDIS_URL`).

## Architecture (Current baseline)

1. **YouTube ingest**: frontend submits URL to backend `/api/ingest`.
2. **Transcript + highlights**: backend routes transcript text through `ai_pipeline.transcribe` and `ai_pipeline.llm` to identify candidate moments.
3. **Clip generation**: backend enqueues clip render jobs; worker calls `ai_pipeline.render` (FFmpeg plan + execution).
4. **Post-generation editing flow**: frontend displays generated clips and allows trimming/title edits before export.

## Environment Setup

Copy `.env.example` to `.env` in your chosen runtime environment and populate provider keys for:

- YouTube download/metadata (`YOUTUBE_API_KEY`, `YTDLP_BINARY`)
- Transcription (`OPENAI_API_KEY`, `DEEPGRAM_API_KEY`, `ASSEMBLYAI_API_KEY`)
- LLM highlight detection (`LLM_PROVIDER`, `LLM_MODEL`, `ANTHROPIC_API_KEY`)
- Video rendering (`FFMPEG_BINARY`, `MAX_CLIP_SECONDS`, `OUTPUT_BUCKET`)

## Next Implementation Pass Requested

After this upload/bootstrap pass, request another implementation pass for:

- (a) robust YouTube ingest
- (b) transcript + highlight detection quality improvements
- (c) short clip generation hardening
- (d) post-generation editing workflow completion
