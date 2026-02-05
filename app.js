const form = document.getElementById("clipForm");
const resultsGrid = document.getElementById("resultsGrid");
const statusText = document.getElementById("statusText");
const selectedClipLabel = document.getElementById("selectedClipLabel");
const subtitleList = document.getElementById("subtitleList");
const subtitleEditor = document.getElementById("subtitleEditor");
const editorForm = document.getElementById("editorForm");
const editorVideo = document.getElementById("editorVideo");
const videoPlaceholder = document.getElementById("videoPlaceholder");
const renderButton = document.getElementById("renderButton");
const downloadLink = document.getElementById("downloadLink");

let selectedClip = null;
let editableSubtitles = [];

const parseUrls = (value) =>
  value
    .split(/\n|,|\s+/)
    .map((url) => url.trim())
    .filter(Boolean);

const extractVideoId = (url) => {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes("youtu.be")) {
      return parsed.pathname.replace("/", "");
    }
    return parsed.searchParams.get("v") || "";
  } catch {
    return "";
  }
};

const formatTime = (seconds) => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
};

const formatTimePrecise = (seconds) => (Number(seconds) || 0).toFixed(2);

const buildSubtitleEditor = () => {
  subtitleEditor.innerHTML = "";
  if (!editableSubtitles.length) {
    subtitleEditor.innerHTML = "<p class='empty-subtitles'>No transcript lines found for this clip.</p>";
    return;
  }

  editableSubtitles.forEach((line, index) => {
    const row = document.createElement("div");
    row.className = "subtitle-row";
    row.innerHTML = `
      <div class="subtitle-time-inputs">
        <label>Start (s)<input type="number" min="0" step="0.1" value="${formatTimePrecise(line.start)}" data-kind="start" data-index="${index}" /></label>
        <label>End (s)<input type="number" min="0.1" step="0.1" value="${formatTimePrecise(line.end)}" data-kind="end" data-index="${index}" /></label>
      </div>
      <textarea rows="2" maxlength="140" data-kind="text" data-index="${index}">${line.text}</textarea>
    `;
    subtitleEditor.appendChild(row);
  });
};

subtitleEditor.addEventListener("input", (event) => {
  const target = event.target;
  const index = Number(target.dataset.index);
  if (Number.isNaN(index) || !editableSubtitles[index]) {
    return;
  }

  const line = editableSubtitles[index];
  if (target.dataset.kind === "text") {
    line.text = target.value;
    return;
  }

  const value = Number(target.value);
  if (Number.isNaN(value)) {
    return;
  }

  if (target.dataset.kind === "start") {
    line.start = Math.max(0, Math.min(value, line.end - 0.1));
    target.value = formatTimePrecise(line.start);
  }

  if (target.dataset.kind === "end") {
    line.end = Math.max(line.start + 0.1, value);
    target.value = formatTimePrecise(line.end);
  }
});

const renderSubtitleOptions = (lines = []) => {
  subtitleList.innerHTML = "";
  if (!lines.length) {
    subtitleList.innerHTML = "<p class='empty-subtitles'>No transcript lines found for this clip.</p>";
    return;
  }

  lines.forEach((line) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "subtitle-line";
    button.innerHTML = `<span>${formatTime(line.start)} - ${formatTime(line.end)}</span>${line.text}`;
    button.addEventListener("click", () => {
      editableSubtitles.push({ start: Number(line.start), end: Number(line.end), text: line.text });
      editableSubtitles.sort((a, b) => a.start - b.start);
      buildSubtitleEditor();
    });
    subtitleList.appendChild(button);
  });
};

const buildPayload = () => ({
  url: selectedClip.url,
  start_seconds: selectedClip.startSeconds,
  end_seconds: selectedClip.endSeconds,
  aspect_ratio: document.getElementById("editorAspectRatio").value,
  speaker_lock: document.getElementById("speakerLock").value !== "off",
  subtitle_style: {
    color: document.getElementById("subtitleColor").value,
    size: Number(document.getElementById("subtitleSize").value),
    style: document.getElementById("subtitleStyle").value,
    position: document.getElementById("subtitlePosition").value,
  },
  subtitles: editableSubtitles
    .map((line) => ({
      start: Number(line.start),
      end: Number(line.end),
      text: (line.text || "").trim(),
    }))
    .filter((line) => line.text && line.end > line.start)
    .sort((a, b) => a.start - b.start),
});

const runRender = async (mode = "manual") => {
  if (!selectedClip) {
    statusText.textContent = "Select a clip first.";
    return;
  }

  statusText.textContent =
    mode === "auto"
      ? "Auto-rendering clip with default preset..."
      : "Re-rendering clip with your updated settings...";

  try {
    const response = await fetch("/api/render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildPayload()),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Render failed.");
    }

    editorVideo.src = `${data.video_url}?t=${Date.now()}`;
    editorVideo.style.display = "block";
    videoPlaceholder.style.display = "none";
    downloadLink.href = data.video_url;
    downloadLink.classList.remove("hidden");
    statusText.textContent = `Render complete. Speaker focus x=${Math.round((data.focus_ratio || 0.5) * 100)}%.`;
  } catch (error) {
    statusText.textContent = error.message || "Render failed.";
  }
};

const buildClipCard = (clip) => {
  const card = document.createElement("article");
  card.className = "result-card";

  const videoId = extractVideoId(clip.url);
  const preview = videoId
    ? `<iframe src="https://www.youtube.com/embed/${videoId}?start=${clip.startSeconds}&end=${clip.endSeconds}&controls=1" allowfullscreen></iframe>`
    : "<div class='video-placeholder'>Preview unavailable</div>";

  card.innerHTML = `
    <h4>${clip.title}</h4>
    <p>${clip.topic}</p>
    <div class="clip-preview">${preview}</div>
    <div class="meta">
      <span>${formatTime(clip.startSeconds)} - ${formatTime(clip.endSeconds)}</span>
      <span>${clip.confidence}% score</span>
    </div>
    <button class="choose-btn" type="button">Edit this clip</button>
  `;

  card.querySelector(".choose-btn").addEventListener("click", async () => {
    selectedClip = clip;
    renderButton.disabled = false;
    selectedClipLabel.textContent = `Editing: ${clip.title} (${formatTime(clip.startSeconds)} - ${formatTime(clip.endSeconds)})`;

    const defaultAspect = document.getElementById("aspectRatio").value;
    document.getElementById("editorAspectRatio").value = defaultAspect;

    editableSubtitles = (clip.transcriptLines || []).map((line) => ({
      start: Number(line.start) || 0,
      end: Number(line.end) || 1,
      text: line.text || "",
    }));

    buildSubtitleEditor();
    renderSubtitleOptions(clip.transcriptLines || []);

    document.querySelectorAll(".result-card").forEach((node) => node.classList.remove("active-clip"));
    card.classList.add("active-clip");

    document.getElementById("editorSection").scrollIntoView({ behavior: "smooth", block: "start" });
    await runRender("auto");
  });

  return card;
};

const renderClips = (clips) => {
  resultsGrid.innerHTML = "";
  if (!clips.length) {
    resultsGrid.innerHTML = "<p class='help-text'>No clips generated for this input.</p>";
    return;
  }

  clips.forEach((clip) => resultsGrid.appendChild(buildClipCard(clip)));
};

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const urls = parseUrls(document.getElementById("videoUrls").value);
  const tone = document.getElementById("tone").value;

  statusText.textContent = "Analyzing transcript, pacing, and speech density...";

  try {
    const response = await fetch("/api/clip", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ urls, tone }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Failed to analyze videos.");
    }

    renderClips(data.clips || []);
    statusText.textContent = "Suggestions ready. Pick one to auto-render instantly.";
  } catch (error) {
    statusText.textContent = error.message || "Could not analyze videos.";
  }
});

editorForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await runRender("manual");
});
