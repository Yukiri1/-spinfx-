def queue_clip_generation(video_id: str, highlights: list[dict]) -> dict:
    return {"video_id": video_id, "clips_queued": len(highlights)}
