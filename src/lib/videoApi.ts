import type { VideoAnalysisResult, VideoIngestInput } from "../types";
import { apiUrl } from "./apiBase";

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

export async function analyzeVideoUrl(
  url: string,
  input: VideoIngestInput,
): Promise<VideoAnalysisResult> {
  const response = await fetch(apiUrl("/api/analyze-video-url"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      url,
      teamName: input.teamName,
      opponentName: input.opponentName,
      competition: input.competition,
      venue: input.venue,
      scoreline: input.scoreline,
      gameState: input.gameState,
      matchDate: input.matchDate,
    }),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as
      | { detail?: string }
      | null;
    throw new Error(payload?.detail || "Video analysis failed.");
  }

  return (await response.json()) as VideoAnalysisResult;
}
