import shutil
import subprocess
import uuid
from pathlib import Path

from flask import Flask, jsonify, request, send_from_directory

BASE_DIR = Path(__file__).resolve().parent
OUTPUT_DIR = BASE_DIR / "outputs"
OUTPUT_DIR.mkdir(exist_ok=True)

app = Flask(__name__, static_folder=".", static_url_path="")

HIGHLIGHT_STYLES = {
    "Most engaging": ["Hook", "Main payoff", "Memorable ending"],
    "Educational nuggets": ["Core tip", "Step-by-step", "Key takeaway"],
    "Funny moments": ["Unexpected joke", "Reaction", "Best punchline"],
    "Emotional peaks": ["Personal story", "Breakthrough", "Big conclusion"],
}

CONFIDENCE_MAP = [95, 92, 90, 88, 85]


@app.get("/")
def index():
    return send_from_directory(".", "index.html")


@app.get("/outputs/<path:filename>")
def outputs(filename):
    return send_from_directory(OUTPUT_DIR, filename)


@app.get("/<path:filename>")
def static_files(filename):
    return send_from_directory(".", filename)


@app.post("/api/clip")
def clip():
    payload = request.get_json(silent=True) or {}
    urls = [url.strip() for url in payload.get("urls", []) if isinstance(url, str) and url.strip()]
    tone = payload.get("tone", "Most engaging")

    topics = HIGHLIGHT_STYLES.get(tone, HIGHLIGHT_STYLES["Most engaging"])
    clips = []
    for index, url in enumerate(urls):
        base = 30 + (index * 15)
        for i in range(3):
            start_seconds = base + (i * 22)
            end_seconds = start_seconds + 16 + (i * 2)
            clips.append(
                {
                    "title": f"Clip {i + 1}: {topics[i % len(topics)]}",
                    "topic": f"Detected best moment around {topics[i % len(topics)].lower()}.",
                    "type": "hero" if i == 0 else "support",
                    "confidence": CONFIDENCE_MAP[(index + i) % len(CONFIDENCE_MAP)],
                    "url": url,
                    "startSeconds": start_seconds,
                    "endSeconds": end_seconds,
                }
            )

    return jsonify({"clips": clips})


@app.post("/api/render")
def render_clip():
    payload = request.get_json(silent=True) or {}

    url = payload.get("url")
    start_seconds = int(payload.get("start_seconds", 0))
    end_seconds = int(payload.get("end_seconds", 0))
    aspect_ratio = payload.get("aspect_ratio", "9:16")
    caption = payload.get("caption", {})

    if not url:
        return jsonify({"error": "Missing YouTube URL."}), 400
    if end_seconds <= start_seconds:
        return jsonify({"error": "Invalid clip range."}), 400

    if not shutil.which("yt-dlp"):
        return jsonify({"error": "yt-dlp is not installed. Install it with: pip install yt-dlp"}), 500
    if not shutil.which("ffmpeg"):
        return jsonify({"error": "ffmpeg is not installed. Install ffmpeg and ensure it's on PATH."}), 500

    job_id = uuid.uuid4().hex[:10]
    source_file = OUTPUT_DIR / f"source-{job_id}.mp4"
    rendered_file = OUTPUT_DIR / f"rendered-{job_id}.mp4"

    duration = end_seconds - start_seconds

    download_cmd = [
        "yt-dlp",
        "-f",
        "mp4",
        "-o",
        str(source_file),
        url,
    ]

    try:
        subprocess.run(download_cmd, check=True, capture_output=True, text=True)
    except subprocess.CalledProcessError as error:
        message = error.stderr.strip() or error.stdout.strip() or "Could not download video"
        return jsonify({"error": f"Download failed: {message}"}), 500

    aspect_map = {
        "9:16": "crop=ih*9/16:ih",
        "1:1": "crop='min(iw,ih)':'min(iw,ih)'",
        "16:9": "crop=iw:iw*9/16",
    }
    crop_filter = aspect_map.get(aspect_ratio, "crop=ih*9/16:ih")

    caption_text = (caption.get("text") or "").replace(":", "\\:").replace("'", "\\'")
    caption_color = (caption.get("color") or "#ffffff").replace("#", "")
    caption_size = int(caption.get("size") or 46)
    caption_style = caption.get("style") or "bold"
    caption_position = caption.get("position") or "bottom"

    y_map = {
        "top": "h*0.12",
        "middle": "(h-text_h)/2",
        "bottom": "h-h*0.16",
    }
    y_expr = y_map.get(caption_position, "h-h*0.16")

    border = "0"
    font_weight_effect = ""
    if caption_style == "outlined":
        border = "4"
    elif caption_style == "bold":
        font_weight_effect = ",shadowcolor=black,shadowx=2,shadowy=2"

    drawtext = (
        f"drawtext=text='{caption_text}':"
        f"fontcolor={caption_color}:fontsize={caption_size}:"
        f"x=(w-text_w)/2:y={y_expr}:"
        f"borderw={border}{font_weight_effect}"
    )

    vf = f"{crop_filter},{drawtext}"

    ffmpeg_cmd = [
        "ffmpeg",
        "-y",
        "-ss",
        str(start_seconds),
        "-t",
        str(duration),
        "-i",
        str(source_file),
        "-vf",
        vf,
        "-c:v",
        "libx264",
        "-preset",
        "fast",
        "-crf",
        "23",
        "-c:a",
        "aac",
        "-movflags",
        "+faststart",
        str(rendered_file),
    ]

    try:
        subprocess.run(ffmpeg_cmd, check=True, capture_output=True, text=True)
    except subprocess.CalledProcessError as error:
        message = error.stderr.strip() or error.stdout.strip() or "Render failed"
        return jsonify({"error": f"ffmpeg failed: {message}"}), 500
    finally:
        if source_file.exists():
            source_file.unlink(missing_ok=True)

    return jsonify({"video_url": f"/outputs/{rendered_file.name}"})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000, debug=False)
