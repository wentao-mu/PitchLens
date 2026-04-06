import type { VideoAnalysisResult, VideoIngestInput } from "../types";

const API_BASE = (import.meta.env.VITE_API_BASE || "http://127.0.0.1:8000").replace(
  /\/$/,
  "",
);

const apiUrl = (path: string) => `${API_BASE}${path}`;

export async function getVideoEngineHealth() {
  const response = await fetch(apiUrl("/api/health"));
  if (!response.ok) {
    throw new Error("Video engine is unavailable.");
  }
  return (await response.json()) as {
    status: string;
    ffmpegAvailable: boolean;
  };
}

export async function analyzeVideoFile(
  file: File,
  input: VideoIngestInput,
): Promise<VideoAnalysisResult> {
  const form = new FormData();
  form.append("video", file);
  form.append("team_name", input.teamName);
  form.append("opponent_name", input.opponentName);
  form.append("competition", input.competition);
  form.append("venue", input.venue);
  form.append("scoreline", input.scoreline);
  form.append("game_state", input.gameState);
  form.append("match_date", input.matchDate);

  const response = await fetch(apiUrl("/api/analyze-video"), {
    method: "POST",
    body: form,
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as
      | { detail?: string }
      | null;
    throw new Error(payload?.detail || "Video analysis failed.");
  }

  return (await response.json()) as VideoAnalysisResult;
}
