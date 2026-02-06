const statusText = document.getElementById("statusText");
const selectedClipLabel = document.getElementById("selectedClipLabel");
const subtitleList = document.getElementById("subtitleList");
const subtitleEditor = document.getElementById("subtitleEditor");
const editorForm = document.getElementById("editorForm");
const editorVideo = document.getElementById("editorVideo");
const editorEmbed = document.getElementById("editorEmbed");
const videoPlaceholder = document.getElementById("videoPlaceholder");
const downloadLink = document.getElementById("downloadLink");
const editorTitle = document.getElementById("editorTitle");

let selectedClip = null;
let editableSubtitles = [];

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
    statusText.textContent = "No clip selected. Go back and choose one.";
    return;
  }

  statusText.textContent =
    mode === "auto"
      ? "Loading your clip preview..."
      : "Updating preview with your settings...";

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

    if (data.preview_embed_url) {
      editorEmbed.src = data.preview_embed_url;
      editorEmbed.classList.remove("hidden");
      editorVideo.pause();
      editorVideo.removeAttribute("src");
      editorVideo.load();
      editorVideo.style.display = "none";
      downloadLink.classList.add("hidden");
      statusText.textContent = data.message || "Preview ready. Install ffmpeg to export downloadable files.";
    } else {
      editorVideo.src = `${data.video_url}?t=${Date.now()}`;
      editorVideo.style.display = "block";
      editorEmbed.src = "";
      editorEmbed.classList.add("hidden");
      downloadLink.href = data.video_url;
      downloadLink.classList.remove("hidden");
      statusText.textContent = `Render complete. Speaker focus x=${Math.round((data.focus_ratio || 0.5) * 100)}%.`;
    }

    videoPlaceholder.style.display = "none";
  } catch (error) {
    statusText.textContent = error.message || "Render failed.";
  }
};

const loadSelectedClip = () => {
  const raw = localStorage.getItem("clipcraft:selectedClip");
  if (!raw) {
    statusText.textContent = "No clip found. Return to the analysis page and choose a clip.";
    return;
  }

  try {
    const parsed = JSON.parse(raw);
    selectedClip = parsed.clip;
    document.getElementById("editorAspectRatio").value = parsed.defaultAspectRatio || "9:16";

    editorTitle.textContent = `Editing: ${selectedClip.title}`;
    selectedClipLabel.textContent = `Clip range: ${formatTime(selectedClip.startSeconds)} - ${formatTime(selectedClip.endSeconds)}`;

    editableSubtitles = (selectedClip.transcriptLines || []).map((line) => ({
      start: Number(line.start) || 0,
      end: Number(line.end) || 1,
      text: line.text || "",
    }));

    buildSubtitleEditor();
    renderSubtitleOptions(selectedClip.transcriptLines || []);
    runRender("auto");
  } catch {
    statusText.textContent = "Could not load selected clip. Please choose it again from analysis page.";
  }
};

editorForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await runRender("manual");
});

loadSelectedClip();
