from __future__ import annotations

import shutil
import uuid
from datetime import date
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from .assistant import generate_assistant_reply
from .statsbomb_open_data import import_matches, list_competitions, list_matches
from .video_analysis import AnalysisOptions, analyze_video, ffmpeg_available

BASE_DIR = Path(__file__).resolve().parent
OUTPUT_DIR = BASE_DIR / "output"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

ALLOWED_VIDEO_EXTENSIONS = {
    ".mp4",
    ".mov",
    ".m4v",
    ".avi",
    ".mkv",
    ".webm",
}

app = FastAPI(title="PitchLens Video Engine")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.mount("/assets", StaticFiles(directory=OUTPUT_DIR), name="assets")


class AssistantMessage(BaseModel):
    role: str
    content: str


class AssistantRequest(BaseModel):
    question: str
    conversation: list[AssistantMessage] = Field(default_factory=list)
    datasetLabel: str
    analysisTeam: str
    contextLock: str
    activeSignal: str
    comparisonMetricLabel: str
    comparisonText: str
    leftOpponent: str
    rightOpponent: str
    filteredCount: int
    teamClipCount: int
    focusPossession: dict[str, object] | None = None
    rankedPossessions: list[dict[str, object]] = Field(default_factory=list)
    videoSummary: dict[str, object] | None = None
    exportNote: str


class StatsBombImportRequest(BaseModel):
    matchIds: list[int] = Field(default_factory=list)


@app.get("/api/health")
def health() -> dict[str, object]:
    ffmpeg_ready = ffmpeg_available()
    return {
        "status": "ok" if ffmpeg_ready else "degraded",
        "ffmpegAvailable": ffmpeg_ready,
    }


@app.post("/api/assistant")
def assistant_endpoint(payload: AssistantRequest) -> dict[str, str]:
    question = payload.question.strip()
    if not question:
        raise HTTPException(status_code=400, detail="Question cannot be empty.")

    reply = generate_assistant_reply(payload.model_dump())
    return reply


@app.get("/api/statsbomb/competitions")
def statsbomb_competitions_endpoint() -> dict[str, object]:
    try:
        return {"competitions": list_competitions()}
    except RuntimeError as error:
        raise HTTPException(status_code=502, detail=str(error)) from error


@app.get("/api/statsbomb/matches")
def statsbomb_matches_endpoint(
    competition_id: int = Query(..., alias="competitionId"),
    season_id: int = Query(..., alias="seasonId"),
) -> dict[str, object]:
    try:
        return {
            "matches": list_matches(
                competition_id=competition_id,
                season_id=season_id,
            )
        }
    except RuntimeError as error:
        raise HTTPException(status_code=502, detail=str(error)) from error


@app.post("/api/statsbomb/import")
def statsbomb_import_endpoint(payload: StatsBombImportRequest) -> dict[str, object]:
    try:
        return import_matches(payload.matchIds)
    except RuntimeError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.post("/api/analyze-video")
async def analyze_video_endpoint(
    request: Request,
    video: UploadFile = File(...),
    team_name: str = Form(...),
    opponent_name: str = Form("Opponent"),
    competition: str = Form("Video session"),
    venue: str = Form("Home"),
    scoreline: str = Form("0-0"),
    game_state: str = Form("Drawing"),
    match_date: str = Form(date.today().isoformat()),
) -> dict[str, object]:
    if not ffmpeg_available():
        raise HTTPException(status_code=503, detail="ffmpeg/ffprobe are not available.")

    suffix = Path(video.filename or "").suffix.lower()
    if suffix not in ALLOWED_VIDEO_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail="Unsupported video type. Use mp4, mov, m4v, avi, mkv, or webm.",
        )

    if venue not in {"Home", "Away"}:
        raise HTTPException(status_code=400, detail="Venue must be Home or Away.")

    if game_state not in {"Winning", "Drawing", "Losing"}:
        raise HTTPException(
            status_code=400,
            detail="Game state must be Winning, Drawing, or Losing.",
        )

    job_id = uuid.uuid4().hex[:12]
    job_dir = OUTPUT_DIR / job_id
    job_dir.mkdir(parents=True, exist_ok=True)
    input_path = job_dir / f"upload{suffix}"

    try:
        with input_path.open("wb") as handle:
            while chunk := await video.read(1024 * 1024):
                handle.write(chunk)

        options = AnalysisOptions(
            job_id=job_id,
            team_name=team_name.strip() or "Analysis Team",
            opponent_name=opponent_name.strip() or "Opponent",
            competition=competition.strip() or "Video session",
            venue=venue,
            scoreline=scoreline.strip() or "0-0",
            game_state=game_state,
            match_date=match_date or date.today().isoformat(),
        )
        return analyze_video(
            input_path=input_path,
            job_dir=job_dir,
            options=options,
            base_url=str(request.base_url),
        )
    except HTTPException:
        raise
    except Exception as error:
        shutil.rmtree(job_dir, ignore_errors=True)
        raise HTTPException(status_code=500, detail=str(error)) from error
