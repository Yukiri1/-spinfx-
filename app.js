const form = document.getElementById("clipForm");
const resultsGrid = document.getElementById("resultsGrid");
const filterButtons = document.querySelectorAll(".pill");
const statusText = document.getElementById("statusText");
const selectedClipLabel = document.getElementById("selectedClipLabel");
const subtitleList = document.getElementById("subtitleList");
const subtitleEditor = document.getElementById("subtitleEditor");
const pipelineList = document.getElementById("pipelineList");
const editorForm = document.getElementById("editorForm");
const editorVideo = document.getElementById("editorVideo");
const videoPlaceholder = document.getElementById("videoPlaceholder");
const renderButton = document.getElementById("renderButton");
const downloadLink = document.getElementById("downloadLink");

let currentFilter = "all";
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

const formatTimePrecise = (seconds) => {
  const value = Number(seconds) || 0;
  return value.toFixed(2);
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

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
  const kind = target.dataset.kind;
  if (Number.isNaN(index) || !editableSubtitles[index]) {
    return;
  }

  const line = editableSubtitles[index];
  if (kind === "text") {
    line.text = target.value;
    return;
  }

  const value = Number(target.value);
  if (Number.isNaN(value)) {
    return;
  }

  if (kind === "start") {
    line.start = clamp(value, 0, Math.max(0, line.end - 0.1));
    target.value = formatTimePrecise(line.start);
  }

  if (kind === "end") {
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
      editableSubtitles.push({
        start: line.start,
        end: line.end,
        text: line.text,
      });
      editableSubtitles.sort((a, b) => a.start - b.start);
      buildSubtitleEditor();
    });
    subtitleList.appendChild(button);
  });
};

const renderPipeline = (steps = []) => {
  pipelineList.innerHTML = "";
  steps.forEach((step) => {
    const item = document.createElement("li");
    item.innerHTML = `<h4>${step.title}</h4><p>${step.description}</p>`;
    pipelineList.appendChild(item);
  });
};

const buildClipCard = (clip) => {
  const card = document.createElement("article");
  card.className = "result-card";
  card.dataset.type = clip.type;

  const videoId = extractVideoId(clip.url);
  const preview = videoId
    ? `<iframe src="https://www.youtube.com/embed/${videoId}?start=${clip.startSeconds}&end=${clip.endSeconds}&controls=1" allowfullscreen></iframe>`
    : "<div class='video-placeholder'>Preview unavailable</div>";

  card.innerHTML = `
    <span class="tag">${clip.type === "hero" ? "Hero clip" : "Support clip"}</span>
    <h4>${clip.title}</h4>
    <p>${clip.topic}</p>
    <div class="clip-preview">${preview}</div>
    <div class="meta">
      <span>${formatTime(clip.startSeconds)} - ${formatTime(clip.endSeconds)}</span>
      <span>${clip.confidence}% score</span>
    </div>
    <button class="choose-btn" type="button">Edit this clip</button>
  `;

  card.querySelector(".choose-btn").addEventListener("click", () => {
    selectedClip = clip;
    renderButton.disabled = false;
    selectedClipLabel.textContent = `Editing: ${clip.title} (${formatTime(clip.startSeconds)} - ${formatTime(clip.endSeconds)})`;
    statusText.textContent = `Selected: ${clip.title}`;

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
  });

  return card;
};

const applyFilter = () => {
  document.querySelectorAll(".result-card").forEach((card) => {
    const show = currentFilter === "all" || card.dataset.type === currentFilter;
    card.style.display = show ? "flex" : "none";
  });
};

const renderClips = (clips) => {
  resultsGrid.innerHTML = "";
  if (!clips.length) {
    resultsGrid.innerHTML = "<p class='help-text'>No clips generated for this input.</p>";
    return;
  }

  clips.forEach((clip) => resultsGrid.appendChild(buildClipCard(clip)));
  applyFilter();
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
    renderPipeline(data.pipeline || []);
    statusText.textContent = "Suggestions ready. Pick one and edit subtitles.";
  } catch (error) {
    statusText.textContent = error.message || "Could not analyze videos.";
  }
});

filterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    filterButtons.forEach((btn) => btn.classList.remove("active"));
    button.classList.add("active");
    currentFilter = button.dataset.filter;
    applyFilter();
  });
});

editorForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!selectedClip) {
    statusText.textContent = "Select a clip first.";
    return;
  }

  const subtitleLines = editableSubtitles
    .map((line) => ({
      start: Number(line.start),
      end: Number(line.end),
      text: (line.text || "").trim(),
    }))
    .filter((line) => line.text && line.end > line.start)
    .sort((a, b) => a.start - b.start);

  const payload = {
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
    subtitles: subtitleLines,
  };

  statusText.textContent = "Rendering clip: speaker tracking, aspect ratio crop, subtitle burn-in...";

  try {
    const response = await fetch("/api/render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
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
});
