const statusText = document.getElementById("statusText");
const selectedClipLabel = document.getElementById("selectedClipLabel");
const subtitleList = document.getElementById("subtitleList");
const editorVideo = document.getElementById("editorVideo");
const editorEmbed = document.getElementById("editorEmbed");
const videoPlaceholder = document.getElementById("videoPlaceholder");
const downloadLink = document.getElementById("downloadLink");
const exportButton = document.getElementById("exportButton");
const timelineSubtitles = document.getElementById("timelineSubtitles");
const addSubtitleBtn = document.getElementById("addSubtitleBtn");
const trimStart = document.getElementById("trimStart");
const trimEnd = document.getElementById("trimEnd");
const timelineScrubber = document.getElementById("timelineScrubber");
const currentTimeLabel = document.getElementById("currentTime");
const durationTimeLabel = document.getElementById("durationTime");
const overlayLineOne = document.getElementById("overlayLineOne");
const overlayLineTwo = document.getElementById("overlayLineTwo");
const subtitleSize = document.getElementById("subtitleSize");
const sizeValue = document.getElementById("sizeValue");
const textColorToggle = document.getElementById("textColorToggle");
const highlightToggle = document.getElementById("highlightToggle");
const strokeToggle = document.getElementById("strokeToggle");
const backgroundToggle = document.getElementById("backgroundToggle");
const subtitlePosition = document.getElementById("subtitlePosition");
const speakerLock = document.getElementById("speakerLock");
const paletteGrid = document.getElementById("paletteGrid");
const googleLoginButton = document.getElementById("googleLoginButton");
const logoutButton = document.getElementById("logoutButton");
const authUserLabel = document.getElementById("authUserLabel");
const accountsCsvButton = document.getElementById("accountsCsvButton");

let selectedClip = null;
let editableSubtitles = [];
let activeColor = "#ffffff";
let activeRatio = "9:16";

const formatTimecode = (seconds) => {
  const value = Number(seconds) || 0;
  const mins = Math.floor(value / 60);
  const secs = (value % 60).toFixed(1).padStart(4, "0");
  return `${String(mins).padStart(2, "0")}:${secs}`;
};

const formatTime = (seconds) => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
};

const getClipDuration = () => {
  if (!selectedClip) return 0;
  return Math.max(1, Number(selectedClip.endSeconds) - Number(selectedClip.startSeconds));
};

const updateOverlayPreview = () => {
  const first = editableSubtitles[0]?.text || "This is";
  const second = editableSubtitles[1]?.text || "game-changer";

  overlayLineOne.textContent = first;
  overlayLineTwo.innerHTML = `<span>${second}</span>`;

  overlayLineOne.style.fontSize = `${subtitleSize.value}px`;
  overlayLineTwo.style.fontSize = `${Math.max(18, Number(subtitleSize.value) + 2)}px`;

  const color = textColorToggle.checked ? activeColor : "#ffffff";
  overlayLineOne.style.color = color;
  overlayLineTwo.style.color = color;

  overlayLineTwo.classList.toggle("with-highlight", highlightToggle.checked);
  overlayLineOne.classList.toggle("with-stroke", strokeToggle.checked);
  overlayLineTwo.classList.toggle("with-stroke", strokeToggle.checked);
  document.getElementById("captionOverlay").classList.toggle("with-bg", backgroundToggle.checked);

  const overlay = document.getElementById("captionOverlay");
  overlay.classList.remove("pos-top", "pos-middle", "pos-bottom");
  overlay.classList.add(`pos-${subtitlePosition.value}`);
};

const renderSubtitleSuggestions = (lines = []) => {
  subtitleList.innerHTML = "";
  if (!lines.length) {
    subtitleList.innerHTML = "<p class='empty-subtitles'>No preview transcript lines yet. Render will auto-transcribe and burn subtitles from speech.</p>";
    return;
  }

  lines.forEach((line) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "subtitle-line";
    item.innerHTML = `<span>${formatTime(line.start)} - ${formatTime(line.end)}</span>${line.text}`;
    item.addEventListener("click", () => {
      editableSubtitles.push({
        start: Number(line.start) || 0,
        end: Number(line.end) || 1,
        text: line.text || "",
      });
      editableSubtitles.sort((a, b) => a.start - b.start);
      renderTimelineSubtitles();
      updateOverlayPreview();
    });
    subtitleList.appendChild(item);
  });
};

const renderTimelineSubtitles = () => {
  timelineSubtitles.innerHTML = "";

  if (!editableSubtitles.length) {
    timelineSubtitles.innerHTML = "<p class='empty-subtitles'>No subtitles yet. Add one.</p>";
    return;
  }

  editableSubtitles.forEach((line, index) => {
    const row = document.createElement("div");
    row.className = "timeline-sub-row";

    const duration = getClipDuration();
    const leftPercent = Math.max(0, Math.min(96, (line.start / duration) * 100));
    const widthPercent = Math.max(8, ((line.end - line.start) / duration) * 100);

    row.innerHTML = `
      <div class="timeline-sub-block" style="left:${leftPercent}%;width:${widthPercent}%">
        <input type="text" value="${line.text.replace(/"/g, "&quot;")}" data-kind="text" data-index="${index}" />
        <button type="button" data-kind="delete" data-index="${index}">🗑</button>
      </div>
      <div class="timeline-sub-times">
        <input type="number" min="0" step="0.1" value="${line.start.toFixed(1)}" data-kind="start" data-index="${index}" />
        <input type="number" min="0.1" step="0.1" value="${line.end.toFixed(1)}" data-kind="end" data-index="${index}" />
      </div>
    `;

    timelineSubtitles.appendChild(row);
  });
};

timelineSubtitles.addEventListener("input", (event) => {
  const target = event.target;
  const index = Number(target.dataset.index);
  if (Number.isNaN(index) || !editableSubtitles[index]) return;

  const line = editableSubtitles[index];
  if (target.dataset.kind === "text") {
    line.text = target.value;
  }

  if (target.dataset.kind === "start") {
    const value = Number(target.value);
    if (!Number.isNaN(value)) {
      line.start = Math.max(0, Math.min(value, line.end - 0.1));
    }
  }

  if (target.dataset.kind === "end") {
    const value = Number(target.value);
    if (!Number.isNaN(value)) {
      line.end = Math.max(line.start + 0.1, value);
    }
  }

  renderTimelineSubtitles();
  updateOverlayPreview();
});

timelineSubtitles.addEventListener("click", (event) => {
  const target = event.target;
  if (target.dataset.kind !== "delete") return;

  const index = Number(target.dataset.index);
  if (Number.isNaN(index)) return;
  editableSubtitles.splice(index, 1);
  renderTimelineSubtitles();
  updateOverlayPreview();
});

addSubtitleBtn.addEventListener("click", () => {
  const duration = getClipDuration();
  const start = Math.max(0, Math.min(duration - 1, editableSubtitles.at(-1)?.end || 0));
  editableSubtitles.push({ start, end: Math.min(duration, start + 1.8), text: "New subtitle" });
  renderTimelineSubtitles();
  updateOverlayPreview();
});

const buildPayload = () => {
  const clipDuration = getClipDuration();
  const trimStartValue = (Number(trimStart.value) / 100) * clipDuration;
  const trimEndValue = (Number(trimEnd.value) / 100) * clipDuration;

  let style = "clean";
  if (strokeToggle.checked) style = "outlined";
  else if (highlightToggle.checked || backgroundToggle.checked) style = "bold";

  const trimStartAbsolute = Math.floor(Number(selectedClip.startSeconds) + trimStartValue);
  const trimEndAbsolute = Math.max(trimStartAbsolute + 1, Math.ceil(Number(selectedClip.startSeconds) + trimEndValue));

  const customSubtitles = editableSubtitles
    .map((line) => ({
      start: Number(line.start),
      end: Number(line.end),
      text: (line.text || "").trim(),
    }))
    .filter((line) => line.text && line.end > line.start)
    .sort((a, b) => a.start - b.start);

  return {
    url: selectedClip.url,
    start_seconds: trimStartAbsolute,
    end_seconds: trimEndAbsolute,
    aspect_ratio: activeRatio,
    speaker_lock: speakerLock.value !== "off",
    use_transcript_subtitles: customSubtitles.length === 0,
    subtitle_style: {
      color: textColorToggle.checked ? activeColor : "#ffffff",
      size: Number(subtitleSize.value),
      style,
      position: subtitlePosition.value,
      font: document.getElementById("fontSelect").value,
    },
    subtitles: customSubtitles,
  };
};

const runRender = async (mode = "manual") => {
  if (!selectedClip) {
    statusText.textContent = "No clip selected. Go back and pick one.";
    return;
  }

  statusText.textContent = mode === "auto" ? "Building preview with default preset..." : "Rendering your latest edit...";

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
    editorEmbed.src = "";
    editorEmbed.classList.add("hidden");
    downloadLink.href = data.video_url;
    downloadLink.classList.remove("hidden");
    statusText.textContent = `Render complete. Speaker tracking focus at ${Math.round((data.focus_ratio || 0.5) * 100)}%. Transcript subtitles applied.`;

    videoPlaceholder.style.display = "none";
  } catch (error) {
    statusText.textContent = error.message || "Render failed.";
  }
};

const loadSelectedClip = () => {
  const raw = localStorage.getItem("clipcraft:selectedClip");
  if (!raw) {
    statusText.textContent = "No clip found. Return to analysis page and choose one.";
    return;
  }

  try {
    const parsed = JSON.parse(raw);
    selectedClip = parsed.clip;
    activeRatio = parsed.defaultAspectRatio || "9:16";

    selectedClipLabel.textContent = `${selectedClip.title} · ${formatTime(selectedClip.startSeconds)}-${formatTime(selectedClip.endSeconds)}`;

    editableSubtitles = [];

    document.querySelectorAll(".ratio-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.ratio === activeRatio);
    });

    renderSubtitleSuggestions(selectedClip.transcriptLines || []);
    renderTimelineSubtitles();
    updateOverlayPreview();

    const clipDuration = getClipDuration();
    durationTimeLabel.textContent = formatTimecode(clipDuration);

    runRender("auto");
  } catch {
    statusText.textContent = "Could not load selected clip. Choose it again from analysis page.";
  }
};

subtitleSize.addEventListener("input", () => {
  sizeValue.textContent = subtitleSize.value;
  updateOverlayPreview();
});

[textColorToggle, highlightToggle, strokeToggle, backgroundToggle, subtitlePosition].forEach((input) => {
  input.addEventListener("change", updateOverlayPreview);
});

paletteGrid.addEventListener("click", (event) => {
  const target = event.target.closest(".palette-color");
  if (!target) return;

  activeColor = target.dataset.color;
  document.querySelectorAll(".palette-color").forEach((swatch) => swatch.classList.remove("active"));
  target.classList.add("active");
  updateOverlayPreview();
});

document.querySelectorAll(".ratio-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    activeRatio = btn.dataset.ratio;
    document.querySelectorAll(".ratio-btn").forEach((node) => node.classList.remove("active"));
    btn.classList.add("active");
    updateOverlayPreview();
  });
});

trimStart.addEventListener("input", () => {
  if (Number(trimStart.value) >= Number(trimEnd.value)) {
    trimStart.value = Math.max(0, Number(trimEnd.value) - 1);
  }
});

trimEnd.addEventListener("input", () => {
  if (Number(trimEnd.value) <= Number(trimStart.value)) {
    trimEnd.value = Math.min(100, Number(trimStart.value) + 1);
  }
});

editorVideo.addEventListener("timeupdate", () => {
  if (!editorVideo.duration) return;
  const pct = (editorVideo.currentTime / editorVideo.duration) * 100;
  timelineScrubber.value = String(Math.max(0, Math.min(100, pct)));
  currentTimeLabel.textContent = formatTimecode(editorVideo.currentTime);
  durationTimeLabel.textContent = formatTimecode(editorVideo.duration);
});

timelineScrubber.addEventListener("input", () => {
  if (!editorVideo.duration) return;
  editorVideo.currentTime = (Number(timelineScrubber.value) / 100) * editorVideo.duration;
});

document.getElementById("playBtn").addEventListener("click", () => editorVideo.play());
document.getElementById("pauseBtn").addEventListener("click", () => editorVideo.pause());

exportButton.addEventListener("click", () => runRender("manual"));

document.getElementById("autoCropBtn").addEventListener("click", () => {
  speakerLock.value = "on";
  statusText.textContent = "Auto Crop enabled. Speaker tracking will stay focused on active speaker.";
});

const authErrorMap = {
  google_not_configured: "Google login is not configured yet.",
  google_redirect_failed: "Could not start Google login. Check redirect URI settings.",
  google_login_failed: "Google sign-in failed. Check redirect URI in Google Cloud.",
  google_claims_missing: "Google login returned incomplete profile data.",
  google_denied: "Google login was canceled or denied.",
};

const maybeShowAuthError = () => {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("auth_error");
  if (!code) {
    return;
  }
  const detail = params.get("auth_detail") || "";
  const base = authErrorMap[code] || `Authentication error: ${code}`;
  authUserLabel.textContent = detail ? `${base} (${detail})` : base;
};

const initAuth = async () => {
  if (!googleLoginButton || !logoutButton || !authUserLabel) {
    return;
  }

  googleLoginButton.addEventListener("click", async () => {
    try {
      const providerResponse = await fetch("/api/auth/providers");
      const providerData = await providerResponse.json();
      if (!providerData.google?.configured) {
        authUserLabel.textContent = "Google login is not configured on this server.";
        return;
      }
    } catch {
      authUserLabel.textContent = "Could not verify auth config. Trying login anyway...";
    }

    window.location.href = `/auth/login/google?next=${encodeURIComponent(window.location.pathname)}`;
  });

  logoutButton.addEventListener("click", () => {
    window.location.href = `/auth/logout?next=${encodeURIComponent(window.location.pathname)}`;
  });

  maybeShowAuthError();

  try {
    const response = await fetch("/api/me");
    const data = await response.json();
    if (data.authenticated && data.user) {
      googleLoginButton.classList.add("hidden");
      logoutButton.classList.remove("hidden");
      accountsCsvButton?.classList.remove("hidden");
      authUserLabel.textContent = `Signed in as ${data.user.name || data.user.email || "user"}`;
    } else {
      googleLoginButton.classList.remove("hidden");
      logoutButton.classList.add("hidden");
      accountsCsvButton?.classList.add("hidden");
      if (!new URLSearchParams(window.location.search).get("auth_error")) {
        authUserLabel.textContent = "";
      }
    }
  } catch {
    authUserLabel.textContent = authUserLabel.textContent || "";
  }
};

loadSelectedClip();
initAuth();
