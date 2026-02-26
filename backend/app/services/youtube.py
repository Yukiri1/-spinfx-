from uuid import uuid4


def enqueue_ingest(url: str) -> dict:
    # Placeholder for real yt-dlp / YouTube API ingestion.
    return {"job_id": str(uuid4()), "url": url, "status": "queued"}
