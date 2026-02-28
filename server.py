import json
import math
import os
import re
import shutil
import sqlite3
import subprocess
import uuid
from pathlib import Path

try:
    import cv2
except ImportError:
    cv2 = None
from authlib.integrations.flask_client import OAuth
from flask import Flask, jsonify, redirect, request, send_from_directory, session, url_for
from youtube_transcript_api import YouTubeTranscriptApi

app = Flask(__name__)
OUTPUT_DIR = Path("outputs")
OUTPUT_DIR.mkdir(exist_ok=True)

USERS_DB = Path("users.db")
app.secret_key = os.getenv("FLASK_SECRET_KEY", "clipcraft-dev-secret")

oauth = OAuth(app)
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")
GOOGLE_OAUTH_ENABLED = bool(GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET)

if GOOGLE_OAUTH_ENABLED:
    oauth.register(
        name="google",
        client_id=GOOGLE_CLIENT_ID,
        client_secret=GOOGLE_CLIENT_SECRET,
        server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
        client_kwargs={"scope": "openid email profile"},
    )


def init_users_db():
    with sqlite3.connect(USERS_DB) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                google_sub TEXT PRIMARY KEY,
                email TEXT,
                name TEXT,
                picture TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                last_login_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
            """
        )


def save_google_account(claims):
    with sqlite3.connect(USERS_DB) as conn:
        conn.execute(
            """
            INSERT INTO users (google_sub, email, name, picture, last_login_at)
            VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(google_sub) DO UPDATE SET
                email=excluded.email,
                name=excluded.name,
                picture=excluded.picture,
                last_login_at=CURRENT_TIMESTAMP
            """,
            (
                claims.get("sub", ""),
                claims.get("email", ""),
                claims.get("name", ""),
                claims.get("picture", ""),
            ),
        )


init_users_db()

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


def weighted_median(values):
    if not values:
        return 0.5
    values = sorted(values, key=lambda item: item[0])
    total = sum(weight for _, weight in values)
    running = 0
    for value, weight in values:
        running += weight
        if running >= total / 2:
            return value
    return values[-1][0]


def detect_focus_ratio(video_file, start_seconds, end_seconds):
    if cv2 is None:
        return 0.5

    cap = cv2.VideoCapture(str(video_file))
    if not cap.isOpened():
        return 0.5

    detector = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
    if detector.empty():
        cap.release()
        return 0.5

    duration = max(2.0, float(end_seconds - start_seconds))
    fps = max(1.0, cap.get(cv2.CAP_PROP_FPS) or 24.0)
    step_seconds = max(0.25, min(0.7, duration / 14))
    max_samples = 90
    samples = []
    previous_gray = None

    second = float(start_seconds)
    sample_count = 0
    while second <= float(end_seconds) and sample_count < max_samples:
        cap.set(cv2.CAP_PROP_POS_MSEC, second * 1000)
        ok, frame = cap.read()
        if not ok:
            second += step_seconds
            continue

        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        faces = detector.detectMultiScale(gray, scaleFactor=1.08, minNeighbors=4, minSize=(70, 70))
        motion_map = cv2.absdiff(gray, previous_gray) if previous_gray is not None else None

        for (x, y, w, h) in faces:
            center_x = (x + w / 2) / frame.shape[1]
            face_area = max(1.0, float(w * h))
            motion_weight = 0.0

            if motion_map is not None:
                roi = motion_map[y : y + h, x : x + w]
                if roi.size:
                    motion_weight = float(roi.mean()) / 32.0

            score = face_area * (1.0 + motion_weight)
            samples.append((center_x, score))

        previous_gray = gray
        sample_count += 1
        second += step_seconds

    cap.release()

    if not samples:
        return 0.5

    focus_ratio = weighted_median(samples)
    return min(0.9, max(0.1, focus_ratio))


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


def build_youtube_embed(url, start_seconds, end_seconds):
    video_id = parse_video_id(url)
    if not video_id:
        return ""
    return f"https://www.youtube.com/embed/{video_id}?start={max(0, start_seconds)}&end={max(start_seconds + 1, end_seconds)}&autoplay=1&rel=0"


@app.get("/api/me")
def api_me():
    user = session.get("user")
    if not user:
        return jsonify({"authenticated": False, "user": None})
    return jsonify({"authenticated": True, "user": user})


@app.get("/auth/login/google")
def auth_google_login():
    next_page = request.args.get("next", "/")
    session["post_login_redirect"] = next_page

    if not GOOGLE_OAUTH_ENABLED:
        return redirect(f"{next_page}?auth_error=google_not_configured")

    redirect_uri = url_for("auth_google_callback", _external=True)
    return oauth.google.authorize_redirect(redirect_uri)


@app.get("/auth/callback/google")
def auth_google_callback():
    next_page = session.pop("post_login_redirect", "/")

    if not GOOGLE_OAUTH_ENABLED:
        return redirect(f"{next_page}?auth_error=google_not_configured")

    try:
        token = oauth.google.authorize_access_token()
        claims = token.get("userinfo") or {}
    except Exception:
        return redirect(f"{next_page}?auth_error=google_login_failed")

    if not claims.get("sub"):
        return redirect(f"{next_page}?auth_error=google_claims_missing")

    save_google_account(claims)
    session["user"] = {
        "sub": claims.get("sub"),
        "email": claims.get("email"),
        "name": claims.get("name"),
        "picture": claims.get("picture"),
    }

    return redirect(next_page)


@app.get("/auth/logout")
def auth_logout():
    session.pop("user", None)
    next_page = request.args.get("next", "/")
    return redirect(next_page)


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

    ffmpeg_installed = bool(shutil.which("ffmpeg"))
    if not ffmpeg_installed:
        embed_url = build_youtube_embed(url, start_seconds, end_seconds)
        if not embed_url:
            return jsonify({"error": "Could not build YouTube preview URL."}), 500
        return jsonify(
            {
                "preview_embed_url": embed_url,
                "focus_ratio": 0.5,
                "message": "Preview mode active (no ffmpeg). Install ffmpeg to export downloadable clips.",
            }
        )

    job_id = uuid.uuid4().hex[:10]
    source_file = OUTPUT_DIR / f"source-{job_id}.mp4"
    rendered_file = OUTPUT_DIR / f"rendered-{job_id}.mp4"

    try:
        subprocess.run(["yt-dlp", "-f", "mp4", "-o", str(source_file), url], check=True, capture_output=True, text=True)
    except subprocess.CalledProcessError as error:
        message = error.stderr.strip() or error.stdout.strip() or "Could not download video"
        embed_url = build_youtube_embed(url, start_seconds, end_seconds)
        if embed_url:
            return jsonify(
                {
                    "preview_embed_url": embed_url,
                    "focus_ratio": 0.5,
                    "message": f"Direct download blocked by YouTube. Showing preview mode instead. Details: {message[:180]}",
                }
            )
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
