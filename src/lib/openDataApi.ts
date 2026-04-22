import type {
  StatsBombCompetition,
  StatsBombImportResponse,
  StatsBombMatch,
} from "../types";
import { apiUrl } from "./apiBase";

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as
      | { detail?: string }
      | null;
    throw new Error(payload?.detail || "Open data request failed.");
  }
  return (await response.json()) as T;
}

export async function getStatsBombCompetitions(): Promise<StatsBombCompetition[]> {
  const response = await fetch(apiUrl("/api/statsbomb/competitions"));
  const payload = await readJson<{ competitions: StatsBombCompetition[] }>(response);
  return payload.competitions;
}

export async function getStatsBombMatches(
  competitionId: number,
  seasonId: number,
): Promise<StatsBombMatch[]> {
  const query = new URLSearchParams({
    competitionId: String(competitionId),
    seasonId: String(seasonId),
  });
  const response = await fetch(apiUrl(`/api/statsbomb/matches?${query.toString()}`));
  const payload = await readJson<{ matches: StatsBombMatch[] }>(response);
  return payload.matches;
}

export async function importStatsBombMatches(
  matchIds: number[],
): Promise<StatsBombImportResponse> {
  const response = await fetch(apiUrl("/api/statsbomb/import"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ matchIds }),
  });

  return await readJson<StatsBombImportResponse>(response);
}
