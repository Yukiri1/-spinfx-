from flask import Flask, jsonify, request, send_from_directory

app = Flask(__name__, static_folder=".", static_url_path="")

HIGHLIGHT_STYLES = {
    "Most engaging": ["Crowd roar", "Plot twist", "Mic drop"],
    "Educational nuggets": ["Key takeaway", "Framework", "Step-by-step"],
    "Funny moments": ["Unexpected joke", "Bloopers", "Reaction"],
    "Emotional peaks": ["Heartfelt story", "Breakthrough", "Standing ovation"],
}

CONFIDENCE_MAP = [94, 91, 88, 86, 83]


def generate_clips(urls, tone):
    clips = []
    topics = HIGHLIGHT_STYLES.get(tone, HIGHLIGHT_STYLES["Most engaging"])
    for index, url in enumerate(urls):
        base_minute = 2 + index * 3
        for clip_index in range(3):
            start = base_minute + clip_index * 4
            end = start + 1 + (index % 2)
            start_seconds = start * 60
            end_seconds = end * 60
            duration = end_seconds - start_seconds
            clip_type = "hero" if clip_index == 0 else "support"
            topic = topics[clip_index % len(topics)]
            clips.append(
                {
                    "title": f"Clip {clip_index + 1}: {topic}",
                    "timeRange": f"{start}:00 - {end}:00",
                    "startSeconds": start_seconds,
                    "endSeconds": end_seconds,
                    "duration": duration,
                    "topic": f"Detected spike around {topic.lower()}.",
                    "type": clip_type,
                    "confidence": CONFIDENCE_MAP[(index + clip_index) % len(CONFIDENCE_MAP)],
                    "url": url,
                }
            )
    return clips


@app.get("/")
def index():
    return send_from_directory(".", "index.html")


@app.post("/api/clip")
def clip():
    payload = request.get_json(silent=True) or {}
    urls = payload.get("urls", [])
    tone = payload.get("tone", "Most engaging")
    urls = [url.strip() for url in urls if isinstance(url, str) and url.strip()]
    clips = generate_clips(urls, tone) if urls else []
    return jsonify({"clips": clips})


@app.get("/<path:filename>")
def static_files(filename):
    return send_from_directory(".", filename)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000, debug=False)
