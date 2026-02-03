const form = document.getElementById("clipForm");
const resultsGrid = document.getElementById("resultsGrid");
const filterButtons = document.querySelectorAll(".pill");
const demoButton = document.getElementById("demoButton");
const statusText = document.getElementById("statusText");

const sampleUrls = [
  "https://www.youtube.com/watch?v=YbJOTdZBX1g",
  "https://youtu.be/aqz-KE-bpKQ",
];

const highlightStyles = {
  "Most engaging": ["Crowd roar", "Plot twist", "Mic drop"],
  "Educational nuggets": ["Key takeaway", "Framework", "Step-by-step"],
  "Funny moments": ["Unexpected joke", "Bloopers", "Reaction"],
  "Emotional peaks": ["Heartfelt story", "Breakthrough", "Standing ovation"],
};

const confidenceMap = [94, 91, 88, 86, 83];

const parseUrls = (value) =>
  value
    .split(/\n|,|\s+/)
    .map((url) => url.trim())
    .filter((url) => url.length > 0);

const buildClip = ({
  title,
  timeRange,
  type,
  confidence,
  topic,
  url,
  duration,
}) => {
  const card = document.createElement("article");
  card.className = "result-card";
  card.dataset.type = type;

  card.innerHTML = `
    <span class="tag">${type === "hero" ? "Hero clip" : "Support"}</span>
    <h4>${title}</h4>
    <p>${topic}</p>
    <div class="meta">
      <span>${timeRange}</span>
      <span>${duration} sec</span>
    </div>
    <div class="meta">
      <span>${url}</span>
      <span>${confidence}% confidence</span>
    </div>
  `;

  return card;
};

const generateClips = (urls, tone) => {
  const clips = [];
  urls.forEach((url, index) => {
    const baseMinute = 2 + index * 3;
    const topics = highlightStyles[tone] || highlightStyles["Most engaging"];
    const clipCount = 3;

    for (let i = 0; i < clipCount; i += 1) {
      const start = baseMinute + i * 4;
      const end = start + 1 + (index % 2);
      const duration = (end - start) * 60;
      const type = i === 0 ? "hero" : "support";
      clips.push({
        title: `Clip ${i + 1}: ${topics[i % topics.length]}`,
        timeRange: `${start}:00 - ${end}:00`,
        duration,
        topic: `Detected spike around ${topics[i % topics.length].toLowerCase()}.`,
        type,
        confidence: confidenceMap[(index + i) % confidenceMap.length],
        url,
      });
    }
  });

  return clips;
};

const renderClips = (clips) => {
  resultsGrid.innerHTML = "";
  if (clips.length === 0) {
    resultsGrid.innerHTML =
      "<p class=\"empty\">Add a YouTube URL to see highlight suggestions.</p>";
    return;
  }

  clips.forEach((clip) => {
    resultsGrid.appendChild(buildClip(clip));
  });
};

const updateFilter = (filter) => {
  document.querySelectorAll(".result-card").forEach((card) => {
    const matches = filter === "all" || card.dataset.type === filter;
    card.style.display = matches ? "flex" : "none";
  });
};

filterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    filterButtons.forEach((btn) => btn.classList.remove("active"));
    button.classList.add("active");
    updateFilter(button.dataset.filter);
  });
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const urls = parseUrls(document.getElementById("videoUrls").value);
  const tone = document.getElementById("tone").value;
  statusText.textContent = "Analyzing clips...";
  fetch("/api/clip", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ urls, tone }),
  })
    .then((response) => {
      if (!response.ok) {
        throw new Error("Backend error");
      }
      return response.json();
    })
    .then((data) => {
      renderClips(data.clips || []);
      updateFilter(document.querySelector(".pill.active").dataset.filter);
      statusText.textContent = "Highlights ready.";
    })
    .catch(() => {
      renderClips(generateClips(urls, tone));
      updateFilter(document.querySelector(".pill.active").dataset.filter);
      statusText.textContent =
        "Backend unavailable. Showing local preview results.";
    });
});

demoButton.addEventListener("click", () => {
  const textarea = document.getElementById("videoUrls");
  textarea.value = sampleUrls.join("\n");
  form.requestSubmit();
});

renderClips(generateClips(sampleUrls, "Most engaging"));
statusText.textContent = "Ready to analyze.";
