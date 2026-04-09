from __future__ import annotations

import json
from typing import Any
from urllib import error, parse, request

OPEN_DATA_BASE = "https://raw.githubusercontent.com/statsbomb/open-data/master/data"
REQUEST_HEADERS = {"User-Agent": "PitchLens/0.1"}


def _fetch_json(path: str) -> Any:
    url = f"{OPEN_DATA_BASE}/{path.lstrip('/')}"
    request_obj = request.Request(url, headers=REQUEST_HEADERS, method="GET")
    try:
        with request.urlopen(request_obj, timeout=45) as response:
            return json.loads(response.read().decode("utf-8"))
    except error.HTTPError as exc:
        raise RuntimeError(f"StatsBomb Open Data request failed: {exc.code}") from exc
    except (error.URLError, TimeoutError, json.JSONDecodeError) as exc:
        raise RuntimeError("StatsBomb Open Data is unavailable.") from exc


def _fetch_optional_json(path: str) -> Any | None:
    url = f"{OPEN_DATA_BASE}/{path.lstrip('/')}"
    request_obj = request.Request(url, headers=REQUEST_HEADERS, method="GET")
    try:
        with request.urlopen(request_obj, timeout=45) as response:
            return json.loads(response.read().decode("utf-8"))
    except error.HTTPError as exc:
        if exc.code == 404:
            return None
        raise RuntimeError(f"StatsBomb Open Data request failed: {exc.code}") from exc
    except (error.URLError, TimeoutError, json.JSONDecodeError) as exc:
        raise RuntimeError("StatsBomb Open Data is unavailable.") from exc


def list_competitions() -> list[dict[str, Any]]:
    payload = _fetch_json("competitions.json")
    competitions: list[dict[str, Any]] = []

    for item in payload:
        competition_id = int(item["competition_id"])
        season_id = int(item["season_id"])
        competition_name = str(item.get("competition_name", "Unknown competition"))
        season_name = str(item.get("season_name", "Unknown season"))
        country_name = str(item.get("country_name", "Unknown country"))
        competition_gender = str(item.get("competition_gender", "unknown"))
        label = f"{competition_name} {season_name} ({competition_gender})"
        competitions.append(
            {
                "key": f"{competition_id}:{season_id}",
                "competitionId": competition_id,
                "seasonId": season_id,
                "label": label,
                "competitionName": competition_name,
                "seasonName": season_name,
                "countryName": country_name,
                "competitionGender": competition_gender,
            }
        )

    competitions.sort(key=lambda item: item["label"])
    return competitions


def list_matches(competition_id: int, season_id: int) -> list[dict[str, Any]]:
    payload = _fetch_json(f"matches/{competition_id}/{season_id}.json")
    matches: list[dict[str, Any]] = []

    for item in payload:
        home_team = str(item.get("home_team", {}).get("home_team_name", "Home"))
        away_team = str(item.get("away_team", {}).get("away_team_name", "Away"))
        home_score = item.get("home_score")
        away_score = item.get("away_score")
        match_date = str(item.get("match_date", ""))
        stage = str(item.get("competition_stage", {}).get("name", ""))
        scoreline = (
            f"{home_score}-{away_score}"
            if home_score is not None and away_score is not None
            else ""
        )
        label_bits = [f"{home_team} vs {away_team}", match_date]
        if stage:
            label_bits.append(stage)
        matches.append(
            {
                "matchId": int(item["match_id"]),
                "label": " | ".join(bit for bit in label_bits if bit),
                "matchDate": match_date,
                "homeTeam": home_team,
                "awayTeam": away_team,
                "scoreline": scoreline,
                "competitionStage": stage,
            }
        )

    matches.sort(key=lambda item: item["matchDate"], reverse=True)
    return matches


def import_matches(match_ids: list[int]) -> dict[str, Any]:
    if not match_ids:
        raise RuntimeError("Select at least one match.")

    files: list[dict[str, str]] = []
    for match_id in match_ids[:6]:
        events = _fetch_json(f"events/{match_id}.json")
        three_sixty = _fetch_optional_json(f"three-sixty/{match_id}.json") or []
        files.append(
            {
                "name": f"statsbomb-match-{match_id}.json",
                "text": json.dumps(
                    {
                        "source": "statsbomb-open-data",
                        "matchId": match_id,
                        "events": events,
                        "threeSixty": three_sixty,
                    }
                ),
            }
        )

    dataset_label = (
        f"StatsBomb Open Data ({len(files)} match files)"
        if len(files) > 1
        else f"StatsBomb Open Data ({match_ids[0]})"
    )

    return {
        "datasetLabel": dataset_label,
        "files": files,
    }
