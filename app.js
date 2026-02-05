const form = document.getElementById("clipForm");
const resultsGrid = document.getElementById("resultsGrid");
const statusText = document.getElementById("statusText");

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

const persistClipForEditor = (clip) => {
  const payload = {
    clip,
    defaultAspectRatio: document.getElementById("aspectRatio").value,
  };
  localStorage.setItem("clipcraft:selectedClip", JSON.stringify(payload));
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

  card.querySelector(".choose-btn").addEventListener("click", () => {
    persistClipForEditor(clip);
    window.location.href = "/editor.html";
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
    statusText.textContent = "Suggestions ready. Choose one to open the editor.";
  } catch (error) {
    statusText.textContent = error.message || "Could not analyze videos.";
  }
});
