const form = document.getElementById("clipForm");
const heroSection = document.getElementById("heroSection");
const processingState = document.getElementById("processingState");
const resultsState = document.getElementById("resultsState");
const resultsGrid = document.getElementById("resultsGrid");
const statusText = document.getElementById("statusText");
const processingUrl = document.getElementById("processingUrl");
const resultsTitle = document.getElementById("resultsTitle");
const resultsSubtitle = document.getElementById("resultsSubtitle");

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

const showState = (state) => {
  heroSection.classList.toggle("hidden", state !== "hero");
  processingState.classList.toggle("hidden", state !== "processing");
  resultsState.classList.toggle("hidden", state !== "results");
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
    resultsTitle.textContent = "No clips found";
    resultsSubtitle.textContent = "";
    resultsGrid.innerHTML = `
      <article class="empty-state-card">
        <h3>No clips found</h3>
        <p>We couldn't find highly engaging moments for this video.</p>
      </article>
    `;
    return;
  }

  resultsTitle.textContent = `Found ${clips.length} clip${clips.length > 1 ? "s" : ""}`;
  resultsSubtitle.textContent = "Select a clip to open the editor and fine-tune subtitles + framing.";
  clips.forEach((clip) => resultsGrid.appendChild(buildClipCard(clip)));
};

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const urls = parseUrls(document.getElementById("videoUrls").value);
  const tone = document.getElementById("tone").value;
  const primaryUrl = urls[0] || "";

  showState("processing");
  processingUrl.textContent = primaryUrl;
  statusText.textContent = "Our models are analyzing the video to find the most engaging highlights.";

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
    showState("results");
  } catch (error) {
    statusText.textContent = error.message || "Could not analyze videos.";
  }
});

const googleLoginButton = document.getElementById("googleLoginButton");
const logoutButton = document.getElementById("logoutButton");
const authUserLabel = document.getElementById("authUserLabel");

const initAuth = async () => {
  if (!googleLoginButton || !logoutButton || !authUserLabel) {
    return;
  }

  googleLoginButton.addEventListener("click", () => {
    window.location.href = `/auth/login/google?next=${encodeURIComponent(window.location.pathname)}`;
  });

  logoutButton.addEventListener("click", () => {
    window.location.href = `/auth/logout?next=${encodeURIComponent(window.location.pathname)}`;
  });

  try {
    const response = await fetch("/api/me");
    const data = await response.json();
    if (data.authenticated && data.user) {
      googleLoginButton.classList.add("hidden");
      logoutButton.classList.remove("hidden");
      authUserLabel.textContent = `Signed in as ${data.user.name || data.user.email || "user"}`;
    } else {
      googleLoginButton.classList.remove("hidden");
      logoutButton.classList.add("hidden");
      authUserLabel.textContent = "";
    }
  } catch {
    authUserLabel.textContent = "";
  }
};

initAuth();
