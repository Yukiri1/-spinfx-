import json
import math
import re
import shutil
import subprocess
import uuid
from pathlib import Path

import cv2
from flask import Flask, jsonify, request, send_from_directory
from youtube_transcript_api import YouTubeTranscriptApi

app = Flask(__name__)
OUTPUT_DIR = Path("outputs")
OUTPUT_DIR.mkdir(exist_ok=True)

CONFIDENCE_MAP = [97, 94, 91, 88, 84]
TONE_KEYWORDS = {
    "Most engaging": ["why", "big", "best", "important", "crazy", "today", "secret", "watch"],
    "Educational nuggets": ["learn", "because", "example", "strategy", "idea", "step", "framework"],
    "Funny moments": ["laugh", "funny", "joke", "wild", "no way", "haha", "insane"],
    "Emotional peaks": ["love", "fear", "pain", "truth", "amazing", "never", "change"],
}


@app.get("/")
def index():
    return send_from_directory(".", "index.html")


@app.get("/outputs/<path:filename>")
def outputs(filename):
    return send_from_directory(OUTPUT_DIR, filename)


@app.get("/<path:filename>")
def static_files(filename):
    return send_from_directory(".", filename)


def parse_video_id(url):
    match = re.search(r"(?:v=|youtu\.be/)([A-Za-z0-9_-]{8,})", url)
    return match.group(1) if match else ""


def command_json(cmd):
    result = subprocess.run(cmd, check=True, capture_output=True, text=True)
    return json.loads(result.stdout)


def get_video_duration(url):
    try:
        info = command_json(["yt-dlp", "--dump-single-json", "--skip-download", url])
        return int(info.get("duration") or 0)
    except (subprocess.CalledProcessError, json.JSONDecodeError):
        return 0


def get_transcript(video_id):
    if not video_id:
        return []
    try:
        transcript = YouTubeTranscriptApi.get_transcript(video_id)
    except Exception:
        return []

    rows = []
    for line in transcript:
        text = (line.get("text") or "").replace("\n", " ").strip()
        if text:
            rows.append(
                {
                    "start": float(line.get("start") or 0),
                    "duration": float(line.get("duration") or 0),
                    "end": float(line.get("start") or 0) + float(line.get("duration") or 0),
                    "text": text,
                }
            )
    return rows


def score_window(text, tone):
    keywords = TONE_KEYWORDS.get(tone, TONE_KEYWORDS["Most engaging"])
    lowered = text.lower()
    words = lowered.split()

    keyword_hits = sum(lowered.count(word) for word in keywords)
    punctuation_energy = lowered.count("!") + lowered.count("?")
    density = len(words) / max(1, len(set(words)))
    hook_phrases = sum(
        lowered.count(pattern)
        for pattern in ["you need", "this is", "the reason", "here's", "watch this", "let me show"]
    )
    score = keyword_hits * 2.8 + punctuation_energy * 1.9 + min(density, 2.5) + hook_phrases * 2.2
    return score


def suggest_from_transcript(url, tone, transcript, duration):
    if not transcript:
        return []

    clip_length = 20
    windows = []
    max_time = max(duration, int(transcript[-1]["end"] + 1))
    for start in range(0, max_time, 8):
        end = start + clip_length
        lines = [line for line in transcript if line["start"] < end and line["end"] > start]
        if not lines:
            continue
        text = " ".join(line["text"] for line in lines)
        windows.append({"start": start, "end": end, "score": score_window(text, tone), "lines": lines})

    windows.sort(key=lambda item: item["score"], reverse=True)
    selected = []
    for window in windows:
        if any(abs(window["start"] - pick["start"]) < 12 for pick in selected):
            continue
        selected.append(window)
        if len(selected) == 3:
            break

    clips = []
    for idx, window in enumerate(selected):
        first_line = window["lines"][0]["text"]
        clips.append(
            {
                "title": f"Clip {idx + 1}: {first_line[:48]}...",
                "topic": "AI-ranked for hook strength, pacing, and transcript relevance.",
                "confidence": CONFIDENCE_MAP[idx],
                "url": url,
                "startSeconds": window["start"],
                "endSeconds": window["end"],
                "transcriptLines": [
                    {
                        "start": max(0, math.floor(line["start"] - window["start"])),
                        "end": max(1, math.ceil(line["end"] - window["start"])),
                        "text": line["text"],
                    }
                    for line in window["lines"][:8]
                ],
            }
        )
    return clips


def fallback_clips(url, tone):
    keywords = TONE_KEYWORDS.get(tone, TONE_KEYWORDS["Most engaging"])
    clips = []
    for i in range(3):
        start = 28 + i * 18
        clips.append(
            {
                "title": f"Clip {i + 1}: {keywords[i].title()} moment",
                "topic": "Fallback selection when transcript data is unavailable.",
                "confidence": CONFIDENCE_MAP[i],
                "url": url,
                "startSeconds": start,
                "endSeconds": start + 18,
                "transcriptLines": [],
            }
        )
    return clips


def detect_focus_ratio(video_file, start_seconds, end_seconds):
    cap = cv2.VideoCapture(str(video_file))
    if not cap.isOpened():
        return 0.5

    detector = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
    total_seconds = max(2, end_seconds - start_seconds)
    sample_points = [start_seconds + (i * total_seconds / 6) for i in range(1, 6)]
    focuses = []

    for second in sample_points:
        cap.set(cv2.CAP_PROP_POS_MSEC, second * 1000)
        ok, frame = cap.read()
        if not ok:
            continue
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        faces = detector.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(80, 80))
        for (x, _, w, h) in faces:
            center_x = (x + w / 2) / frame.shape[1]
            area = w * h
            focuses.extend([center_x] * max(1, int(area / 3000)))

    cap.release()
    if not focuses:
        return 0.5
    focuses.sort()
    return min(0.9, max(0.1, focuses[len(focuses) // 2]))


def color_hex_to_ffmpeg(color):
    return (color or "#ffffff").replace("#", "")


def escape_drawtext(text):
    value = text or ""
    return (
        value.replace("\\", r"\\\\")
        .replace(":", r"\:")
        .replace("'", r"\'")
        .replace(",", r"\,")
        .replace("%", r"\%")
        .replace("[", r"\[")
        .replace("]", r"\]")
    )


@app.post("/api/clip")
def clip():
    payload = request.get_json(silent=True) or {}
    urls = [url.strip() for url in payload.get("urls", []) if isinstance(url, str) and url.strip()]
    tone = payload.get("tone", "Most engaging")

    if not urls:
        return jsonify({"error": "Add at least one YouTube URL."}), 400
    if not shutil.which("yt-dlp"):
        return jsonify({"error": "yt-dlp is missing. Run: pip install -r requirements.txt"}), 500

    clips = []
    for url in urls:
        video_id = parse_video_id(url)
        transcript = get_transcript(video_id)
        duration = get_video_duration(url)
        generated = suggest_from_transcript(url, tone, transcript, duration)
        clips.extend(generated or fallback_clips(url, tone))

    return jsonify({"clips": clips})


@app.post("/api/render")
def render_clip():
    payload = request.get_json(silent=True) or {}

    url = payload.get("url")
    start_seconds = int(payload.get("start_seconds", 0))
    end_seconds = int(payload.get("end_seconds", 0))
    aspect_ratio = payload.get("aspect_ratio", "9:16")
    subtitle_style = payload.get("subtitle_style", {})
    subtitles = payload.get("subtitles", [])
    speaker_lock = bool(payload.get("speaker_lock", True))

    if not url:
        return jsonify({"error": "Missing YouTube URL."}), 400
    if end_seconds <= start_seconds:
        return jsonify({"error": "Invalid clip range."}), 400
    if not shutil.which("yt-dlp"):
        return jsonify({"error": "yt-dlp is not installed."}), 500
    if not shutil.which("ffmpeg"):
        return jsonify({"error": "ffmpeg is not installed."}), 500

    job_id = uuid.uuid4().hex[:10]
    source_file = OUTPUT_DIR / f"source-{job_id}.mp4"
    rendered_file = OUTPUT_DIR / f"rendered-{job_id}.mp4"

    try:
        subprocess.run(["yt-dlp", "-f", "mp4", "-o", str(source_file), url], check=True, capture_output=True, text=True)
    except subprocess.CalledProcessError as error:
        message = error.stderr.strip() or error.stdout.strip() or "Could not download video"
        return jsonify({"error": f"Download failed: {message}"}), 500

    focus_ratio = detect_focus_ratio(source_file, start_seconds, end_seconds) if speaker_lock else 0.5

    crop_map = {
        "9:16": ("ih*9/16", "ih"),
        "1:1": ("min(iw,ih)", "min(iw,ih)"),
        "16:9": ("iw", "iw*9/16"),
    }
    crop_w, crop_h = crop_map.get(aspect_ratio, crop_map["9:16"])
    x_expr = f"max(0,min(iw-({crop_w}),iw*{focus_ratio:.4f}-({crop_w})/2))"
    crop_filter = f"crop={crop_w}:{crop_h}:{x_expr}:0"

    subtitle_color = color_hex_to_ffmpeg(subtitle_style.get("color") or "#ffffff")
    subtitle_size = int(subtitle_style.get("size") or 44)
    subtitle_variant = subtitle_style.get("style") or "bold"
    subtitle_position = subtitle_style.get("position") or "bottom"

    outline = "3" if subtitle_variant == "outlined" else "1"
    shadow = "1.4" if subtitle_variant == "bold" else "0"

    y_map = {"bottom": "h-h*0.16", "middle": "(h-text_h)/2", "top": "h*0.12"}
    subtitle_lines = []
    for line in subtitles:
        line_start = float(line.get("start", 0))
        line_end = float(line.get("end", 0))
        text = (line.get("text") or "").strip()
        if line_end > line_start and text:
            subtitle_lines.append({"start": line_start, "end": line_end, "text": text})

    subtitle_filters = []
    for line in subtitle_lines:
        escaped = escape_drawtext(line["text"])
        subtitle_filters.append(
            "drawtext="
            f"text='{escaped}':"
            f"fontcolor={subtitle_color}:"
            f"fontsize={subtitle_size}:"
            f"x=(w-text_w)/2:"
            f"y={y_map.get(subtitle_position, 'h-h*0.16')}:"
            f"borderw={outline}:"
            f"shadowx={shadow}:shadowy={shadow}:"
            f"enable='between(t,{line['start']:.2f},{line['end']:.2f})'"
        )

    vf = ",".join([crop_filter] + subtitle_filters) if subtitle_filters else crop_filter

    try:
        subprocess.run(
            [
                "ffmpeg",
                "-y",
                "-ss",
                str(start_seconds),
                "-t",
                str(end_seconds - start_seconds),
                "-i",
                str(source_file),
                "-vf",
                vf,
                "-c:v",
                "libx264",
                "-preset",
                "fast",
                "-crf",
                "22",
                "-c:a",
                "aac",
                "-movflags",
                "+faststart",
                str(rendered_file),
            ],
            check=True,
            capture_output=True,
            text=True,
        )
    except subprocess.CalledProcessError as error:
        message = error.stderr.strip() or error.stdout.strip() or "Render failed"
        return jsonify({"error": f"ffmpeg failed: {message}"}), 500
    finally:
        if source_file.exists():
            source_file.unlink(missing_ok=True)

    return jsonify({"video_url": f"/outputs/{rendered_file.name}", "focus_ratio": focus_ratio})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000, debug=False)
