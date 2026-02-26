export const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

export async function ingestYoutube(url: string) {
  const response = await fetch(`${API_BASE}/api/ingest`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });

  if (!response.ok) {
    throw new Error("Failed to ingest YouTube URL");
  }

  return response.json();
}
