def build_ffmpeg_plan(source_path: str, start: int, end: int) -> list[str]:
    return [
        "ffmpeg",
        "-i",
        source_path,
        "-ss",
        str(start),
        "-to",
        str(end),
        "-c:v",
        "libx264",
        "-c:a",
        "aac",
        "output.mp4",
    ]
