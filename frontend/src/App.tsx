import { FormEvent, useState } from "react";
import { ingestYoutube } from "./api";

function App() {
  const [url, setUrl] = useState("");
  const [message, setMessage] = useState("Ready");

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setMessage("Submitting ingest job...");

    try {
      const payload = await ingestYoutube(url);
      setMessage(`Queued job ${payload.job_id}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unknown error");
    }
  }

  return (
    <main style={{ fontFamily: "sans-serif", maxWidth: 640, margin: "2rem auto" }}>
      <h1>ClipCraft</h1>
      <p>Ingest a YouTube URL to start transcript, highlight, and clip generation.</p>
      <form onSubmit={onSubmit}>
        <input
          style={{ width: "100%", padding: "0.75rem" }}
          placeholder="https://www.youtube.com/watch?v=..."
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <button style={{ marginTop: "1rem", padding: "0.6rem 1.2rem" }} type="submit">
          Start
        </button>
      </form>
      <p>{message}</p>
    </main>
  );
}

export default App;
