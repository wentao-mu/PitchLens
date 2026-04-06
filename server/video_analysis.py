from __future__ import annotations

import json
import math
import shutil
import subprocess
from dataclasses import dataclass
from datetime import date
from fractions import Fraction
from pathlib import Path
from typing import Any
from urllib.parse import urljoin

import numpy as np
from PIL import Image

TACTICAL_SIGNALS = [
    "Left overload release",
    "Central lane break",
    "Press escape chain",
    "Wide switch cutback",
    "Counter-press regain",
]


@dataclass(frozen=True)
class AnalysisOptions:
    job_id: str
    team_name: str
    opponent_name: str
    competition: str
    venue: str
    scoreline: str
    game_state: str
    match_date: str


@dataclass(frozen=True)
class VideoMetadata:
    duration_sec: float
    width: int
    height: int
    fps: float


@dataclass(frozen=True)
class FrameFeature:
    index: int
    path: Path
    time_sec: float
    green_ratio: float
    pitch_confidence: float
    brightness: float
    saturation: float
    line_density: float
    motion_score: float
    peak_diff: float
    cut_score: float
    left_motion: float
    center_motion: float
    right_motion: float
    edge_activity: float
    moment_score: float = 0.0


def _run(command: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        command,
        check=True,
        capture_output=True,
        text=True,
    )


def _clamp(value: float, lower: float, upper: float) -> float:
    return max(lower, min(value, upper))


def _int_clamp(value: float, lower: int, upper: int) -> int:
    return int(round(_clamp(value, lower, upper)))


def _fraction_to_float(value: str) -> float:
    if not value or value == "0/0":
        return 0.0
    return float(Fraction(value))


def ffmpeg_available() -> bool:
    try:
        _run(["ffmpeg", "-version"])
        _run(["ffprobe", "-version"])
        return True
    except Exception:
        return False


def probe_video(video_path: Path) -> VideoMetadata:
    result = _run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "stream=codec_type,width,height,avg_frame_rate:format=duration",
            "-of",
            "json",
            str(video_path),
        ]
    )
    payload = json.loads(result.stdout)
    video_stream = next(
        (
            stream
            for stream in payload.get("streams", [])
            if stream.get("codec_type") == "video"
        ),
        None,
    )
    if video_stream is None:
        raise ValueError("No video stream was found in the uploaded file.")

    duration_text = payload.get("format", {}).get("duration")
    duration_sec = float(duration_text) if duration_text else 0.0
    if duration_sec <= 0:
        raise ValueError("The uploaded video does not report a valid duration.")

    return VideoMetadata(
        duration_sec=duration_sec,
        width=int(video_stream.get("width") or 0),
        height=int(video_stream.get("height") or 0),
        fps=_fraction_to_float(video_stream.get("avg_frame_rate", "0/1")),
    )


def build_streamable_video(input_path: Path, output_path: Path) -> None:
    _run(
        [
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-i",
            str(input_path),
            "-map",
            "0:v:0",
            "-map",
            "0:a?",
            "-vf",
            "scale='min(1280,iw)':-2:flags=lanczos",
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-crf",
            "27",
            "-pix_fmt",
            "yuv420p",
            "-movflags",
            "+faststart",
            "-c:a",
            "aac",
            "-b:a",
            "128k",
            str(output_path),
        ]
    )


def analysis_fps(duration_sec: float) -> float:
    if duration_sec >= 5400:
        return 0.33
    if duration_sec >= 2400:
        return 0.5
    if duration_sec >= 900:
        return 0.9
    return 1.4


def extract_frames(video_path: Path, frame_dir: Path, sample_fps: float) -> list[Path]:
    frame_dir.mkdir(parents=True, exist_ok=True)
    for stale in frame_dir.glob("*.jpg"):
        stale.unlink()

    output_pattern = frame_dir / "frame_%05d.jpg"
    _run(
        [
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-i",
            str(video_path),
            "-vf",
            f"fps={sample_fps},scale=384:-1:flags=lanczos",
            "-q:v",
            "4",
            str(output_pattern),
        ]
    )
    return sorted(frame_dir.glob("frame_*.jpg"))


def compute_frame_features(frame_paths: list[Path], sample_fps: float) -> list[FrameFeature]:
    if not frame_paths:
        raise ValueError("Frame extraction produced no samples.")

    features: list[FrameFeature] = []
    previous_gray: np.ndarray | None = None
    previous_brightness = 0.0

    for index, frame_path in enumerate(frame_paths):
        with Image.open(frame_path) as image:
            rgb = image.convert("RGB")
            hsv = rgb.convert("HSV")
            rgb_array = np.asarray(rgb, dtype=np.float32) / 255.0
            hsv_array = np.asarray(hsv, dtype=np.float32)

        hue = (hsv_array[..., 0] / 255.0) * 360.0
        saturation = hsv_array[..., 1] / 255.0
        value = hsv_array[..., 2] / 255.0
        gray = rgb_array.mean(axis=2)

        green_mask = (
            (hue >= 55.0)
            & (hue <= 170.0)
            & (saturation >= 0.18)
            & (value >= 0.12)
        )
        white_mask = (value >= 0.7) & (saturation <= 0.16)

        green_ratio = float(green_mask.mean())
        brightness = float(value.mean())
        saturation_mean = float(saturation.mean())
        line_density = float(white_mask.mean())
        pitch_confidence = _clamp(
            green_ratio * 1.35 + saturation_mean * 0.12 + line_density * 0.2,
            0.0,
            1.0,
        )

        if previous_gray is None:
            diff = np.zeros_like(gray)
        else:
            diff = np.abs(gray - previous_gray)

        motion_score = float(diff.mean() * 255.0)
        peak_diff = float(np.percentile(diff, 98) * 255.0)
        cut_score = float(
            peak_diff + abs(brightness - previous_brightness) * 140.0
        )

        left_slice, center_slice, right_slice = np.array_split(diff, 3, axis=1)
        left_motion = float(left_slice.mean() * 255.0)
        center_motion = float(center_slice.mean() * 255.0)
        right_motion = float(right_slice.mean() * 255.0)

        height = diff.shape[0]
        width = diff.shape[1]
        top = diff[: max(1, height // 7), :]
        bottom = diff[-max(1, height // 7) :, :]
        left_edge = diff[:, : max(1, width // 9)]
        right_edge = diff[:, -max(1, width // 9) :]
        edge_activity = float(
            np.mean(
                np.concatenate(
                    [
                        top.ravel(),
                        bottom.ravel(),
                        left_edge.ravel(),
                        right_edge.ravel(),
                    ]
                )
            )
            * 255.0
        )

        features.append(
            FrameFeature(
                index=index,
                path=frame_path,
                time_sec=index / sample_fps,
                green_ratio=green_ratio,
                pitch_confidence=pitch_confidence,
                brightness=brightness,
                saturation=saturation_mean,
                line_density=line_density,
                motion_score=motion_score,
                peak_diff=peak_diff,
                cut_score=cut_score,
                left_motion=left_motion,
                center_motion=center_motion,
                right_motion=right_motion,
                edge_activity=edge_activity,
            )
        )
        previous_gray = gray
        previous_brightness = brightness

    return attach_moment_scores(features)


def attach_moment_scores(features: list[FrameFeature]) -> list[FrameFeature]:
    motions = np.array([item.motion_score for item in features], dtype=np.float32)
    lines = np.array([item.line_density for item in features], dtype=np.float32)
    edges = np.array([item.edge_activity for item in features], dtype=np.float32)
    pitch = np.array([item.pitch_confidence for item in features], dtype=np.float32)
    saturation = np.array([item.saturation for item in features], dtype=np.float32)

    def normalize(values: np.ndarray) -> np.ndarray:
        if values.size == 0:
            return values
        low = float(np.percentile(values, 20))
        high = float(np.percentile(values, 92))
        if math.isclose(low, high):
            return np.clip(values, 0.0, 1.0)
        return np.clip((values - low) / (high - low), 0.0, 1.0)

    motion_n = normalize(motions)
    line_n = normalize(lines)
    edge_n = normalize(edges)
    pitch_n = normalize(pitch)
    saturation_n = normalize(saturation)

    scored: list[FrameFeature] = []
    for index, feature in enumerate(features):
        moment_score = float(
            0.42 * motion_n[index]
            + 0.2 * line_n[index]
            + 0.17 * edge_n[index]
            + 0.13 * pitch_n[index]
            + 0.08 * saturation_n[index]
        )
        scored.append(
            FrameFeature(
                **{
                    **feature.__dict__,
                    "moment_score": moment_score,
                }
            )
        )

    return scored


def detect_cut_boundaries(features: list[FrameFeature], duration_sec: float) -> list[float]:
    cut_scores = np.array([item.cut_score for item in features], dtype=np.float32)
    if cut_scores.size == 0:
        return [0.0, duration_sec]

    mean = float(cut_scores.mean())
    std = float(cut_scores.std())
    threshold = mean + std * 1.45

    boundaries = [0.0]
    last_boundary = 0.0
    for feature in features:
        if feature.cut_score >= threshold and feature.time_sec - last_boundary >= 4.0:
            boundaries.append(feature.time_sec)
            last_boundary = feature.time_sec

    if duration_sec - boundaries[-1] >= 1.0:
        boundaries.append(duration_sec)
    elif duration_sec not in boundaries:
        boundaries[-1] = duration_sec

    return sorted(set(round(boundary, 2) for boundary in boundaries))


def select_seed_frames(features: list[FrameFeature], duration_sec: float) -> list[FrameFeature]:
    target_count = max(6, min(14, int(duration_sec / 480) + 7))
    min_gap = 10.0 if duration_sec >= 900 else 6.0

    candidates = sorted(
        (
            feature
            for feature in features
            if feature.pitch_confidence >= 0.15 and feature.moment_score >= 0.18
        ),
        key=lambda item: item.moment_score,
        reverse=True,
    )

    selected: list[FrameFeature] = []
    for candidate in candidates:
        if len(selected) >= target_count:
            break
        if any(abs(candidate.time_sec - existing.time_sec) < min_gap for existing in selected):
            continue
        selected.append(candidate)

    if not selected:
        selected = sorted(features, key=lambda item: item.moment_score, reverse=True)[:6]

    return sorted(selected, key=lambda item: item.time_sec)


def align_to_boundary(
    candidate_time: float,
    boundaries: list[float],
    direction: str,
    tolerance: float,
) -> float:
    if direction == "before":
        valid = [boundary for boundary in boundaries if boundary <= candidate_time]
        if valid and candidate_time - valid[-1] <= tolerance:
            return valid[-1]
        return candidate_time

    valid = [boundary for boundary in boundaries if boundary >= candidate_time]
    if valid and valid[0] - candidate_time <= tolerance:
        return valid[0]
    return candidate_time


def build_candidate_windows(
    seeds: list[FrameFeature],
    boundaries: list[float],
    duration_sec: float,
) -> list[tuple[FrameFeature, float, float]]:
    windows: list[tuple[FrameFeature, float, float]] = []
    for seed in seeds:
        window_duration = _clamp(8.0 + seed.moment_score * 16.0, 8.0, 22.0)
        start = _clamp(seed.time_sec - window_duration * 0.42, 0.0, duration_sec)
        end = _clamp(seed.time_sec + window_duration * 0.58, 0.0, duration_sec)
        start = align_to_boundary(start, boundaries, "before", 3.5)
        end = align_to_boundary(end, boundaries, "after", 3.5)
        if end - start < 6.0:
            end = min(duration_sec, start + 6.0)
        windows.append((seed, round(start, 2), round(end, 2)))

    merged: list[tuple[FrameFeature, float, float]] = []
    for seed, start, end in windows:
        if not merged:
            merged.append((seed, start, end))
            continue

        previous_seed, previous_start, previous_end = merged[-1]
        if start <= previous_end - 2.0:
            previous_score = previous_seed.moment_score
            current_score = seed.moment_score
            if current_score > previous_score:
                merged[-1] = (seed, previous_start, max(previous_end, end))
            else:
                merged[-1] = (previous_seed, previous_start, max(previous_end, end))
            continue

        merged.append((seed, start, end))

    return merged


def frames_in_window(
    features: list[FrameFeature],
    start_sec: float,
    end_sec: float,
) -> list[FrameFeature]:
    scoped = [
        feature
        for feature in features
        if start_sec <= feature.time_sec <= end_sec
    ]
    if scoped:
        return scoped

    nearest = min(features, key=lambda item: abs(item.time_sec - start_sec))
    return [nearest]


def build_signal_scores(
    zone: str,
    phase: str,
    norm_motion: float,
    norm_edge: float,
    norm_line: float,
    duration_sec: float,
) -> dict[str, float]:
    scores = {signal: 0.18 for signal in TACTICAL_SIGNALS}
    duration_n = _clamp(duration_sec / 22.0, 0.0, 1.0)

    scores["Left overload release"] = _clamp(
        0.26
        + (0.38 if zone == "Left lane" else 0.06)
        + (0.18 if phase == "Build-up" else 0.04)
        + duration_n * 0.12,
        0.18,
        0.98,
    )
    scores["Central lane break"] = _clamp(
        0.22
        + (0.36 if zone == "Central lane" else 0.08)
        + norm_motion * 0.18
        + norm_line * 0.12,
        0.18,
        0.98,
    )
    scores["Press escape chain"] = _clamp(
        0.2
        + (0.24 if phase == "Press resistance" else 0.04)
        + norm_edge * 0.24
        + norm_motion * 0.15,
        0.18,
        0.98,
    )
    scores["Wide switch cutback"] = _clamp(
        0.2
        + (0.34 if zone == "Right lane" else 0.06)
        + (0.16 if phase == "Sustained attack" else 0.04)
        + norm_line * 0.18,
        0.18,
        0.98,
    )
    scores["Counter-press regain"] = _clamp(
        0.18
        + (0.34 if phase == "Transition" else 0.05)
        + norm_edge * 0.22
        + (0.12 if duration_sec <= 11.0 else 0.0),
        0.18,
        0.98,
    )

    return scores


def estimate_phase(
    duration_sec: float,
    norm_motion: float,
    norm_edge: float,
) -> str:
    if duration_sec <= 10.5 and norm_motion >= 0.68:
        return "Transition"
    if norm_edge >= 0.65 and norm_motion >= 0.58:
        return "Press resistance"
    if duration_sec >= 14.5 and norm_motion <= 0.64:
        return "Build-up"
    return "Sustained attack"


def estimate_transition_type(phase: str, norm_line: float, norm_edge: float) -> str:
    if phase == "Transition":
        return "Counter"
    if norm_line >= 0.62 and norm_edge >= 0.58:
        return "Set piece regain"
    return "Open play"


def estimate_formation(zone: str, phase: str, norm_edge: float) -> str:
    if phase == "Transition":
        return "Rest-defense 2-3 shell"
    if zone == "Central lane":
        return "Compact 4-2-3-1 shell"
    if norm_edge >= 0.64:
        return "Stretched 3-2-2-3 shell"
    return "Wide 4-3-3 shell"


def estimate_outcome(phase: str, x_threat: float, norm_line: float, norm_motion: float) -> str:
    if x_threat >= 0.78 or norm_line >= 0.72:
        return "Box entry"
    if phase == "Transition" and norm_motion >= 0.72:
        return "Fast attack carry"
    if phase == "Press resistance":
        return "First-line escape"
    if phase == "Build-up":
        return "Progressive retain"
    return "Final-third access"


def build_title(primary_signal: str, outcome: str) -> str:
    mapping = {
        "Left overload release": "Left-side overload opens the release lane",
        "Central lane break": "Central carry breaks the middle lane",
        "Press escape chain": "Press escape preserves the attack",
        "Wide switch cutback": "Weak-side switch creates the finish window",
        "Counter-press regain": "Counter-press keeps the attack alive",
    }
    base = mapping.get(primary_signal, "Video-derived attacking sequence")
    return f"{base} for a {outcome.lower()}"


def build_path(zone: str, primary_signal: str, progression: int, duration_sec: float) -> list[dict[str, Any]]:
    lane_y = {
        "Left lane": 72,
        "Central lane": 50,
        "Right lane": 26,
    }[zone]
    end_y = lane_y
    if primary_signal == "Central lane break":
        end_y = 48
    elif primary_signal == "Wide switch cutback":
        end_y = 20
    elif primary_signal == "Counter-press regain":
        end_y = 40

    end_x = _clamp(54 + progression * 0.36, 58, 90)
    mid_x = _clamp(end_x - max(18.0, duration_sec * 0.9), 22, 62)

    return [
        {"x": 12, "y": lane_y + 4, "label": "Recover"},
        {"x": 24, "y": lane_y, "label": "Set"},
        {"x": round(mid_x, 1), "y": round((lane_y + end_y) / 2, 1), "label": "Break"},
        {"x": round(end_x - 8, 1), "y": round(end_y + 2, 1), "label": "Access"},
        {"x": round(end_x, 1), "y": round(end_y, 1), "label": "Finish"},
    ]


def build_players(primary_signal: str, phase: str) -> list[str]:
    if primary_signal == "Counter-press regain":
        return ["Front line", "Second-ball hunter", "Rest-defense line"]
    if phase == "Build-up":
        return ["Back line", "Pivot", "Interior", "Far-side runner"]
    if primary_signal == "Wide switch cutback":
        return ["Ball-side overload", "Weak-side winger", "Penalty-box runner"]
    return ["Ball carrier", "Support lane", "Final-third runner"]


def build_note(
    zone: str,
    phase: str,
    duration_sec: float,
    norm_motion: float,
    norm_line: float,
) -> str:
    return (
        f"Video analysis isolated a {duration_sec:.0f}s {phase.lower()} passage through the "
        f"{zone.lower()} with movement intensity in the {(norm_motion * 100):.0f}th visual band "
        f"and final-third detail at {(norm_line * 100):.0f}% of the clip profile."
    )


def build_why_it_matters(
    primary_signal: str,
    outcome: str,
    pressure: int,
    x_threat: float,
) -> str:
    return (
        f"This clip packages the {primary_signal.lower()} pattern into a replayable sequence: "
        f"pressure proxy {pressure}, outcome {outcome.lower()}, and video-derived threat {x_threat:.2f}."
    )


def create_poster(video_path: Path, output_path: Path, time_sec: float) -> None:
    _run(
        [
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-ss",
            f"{time_sec:.2f}",
            "-i",
            str(video_path),
            "-frames:v",
            "1",
            "-q:v",
            "3",
            str(output_path),
        ]
    )


def create_clip(
    video_path: Path,
    output_path: Path,
    start_sec: float,
    end_sec: float,
) -> None:
    duration = max(1.0, end_sec - start_sec)
    _run(
        [
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-ss",
            f"{start_sec:.2f}",
            "-i",
            str(video_path),
            "-t",
            f"{duration:.2f}",
            "-map",
            "0:v:0",
            "-map",
            "0:a?",
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-crf",
            "24",
            "-pix_fmt",
            "yuv420p",
            "-movflags",
            "+faststart",
            "-c:a",
            "aac",
            "-b:a",
            "128k",
            str(output_path),
        ]
    )


def stats_from_features(features: list[FrameFeature]) -> dict[str, tuple[float, float]]:
    def quantiles(values: list[float]) -> tuple[float, float]:
        array = np.array(values, dtype=np.float32)
        if array.size == 0:
            return (0.0, 1.0)
        low = float(np.percentile(array, 20))
        high = float(np.percentile(array, 90))
        if math.isclose(low, high):
            high = low + 1.0
        return (low, high)

    return {
        "motion": quantiles([item.motion_score for item in features]),
        "edge": quantiles([item.edge_activity for item in features]),
        "line": quantiles([item.line_density for item in features]),
        "pitch": quantiles([item.pitch_confidence for item in features]),
    }


def scale(value: float, bounds: tuple[float, float]) -> float:
    low, high = bounds
    if math.isclose(low, high):
        return 0.0
    return float(np.clip((value - low) / (high - low), 0.0, 1.0))


def build_possession(
    index: int,
    seed: FrameFeature,
    start_sec: float,
    end_sec: float,
    scoped_features: list[FrameFeature],
    metadata: VideoMetadata,
    options: AnalysisOptions,
    asset_base_url: str,
    stats: dict[str, tuple[float, float]],
    clip_path: Path,
    poster_path: Path,
    full_video_url: str,
) -> dict[str, Any]:
    duration_sec = round(end_sec - start_sec, 2)
    motion_mean = float(np.mean([item.motion_score for item in scoped_features]))
    edge_mean = float(np.mean([item.edge_activity for item in scoped_features]))
    line_mean = float(np.mean([item.line_density for item in scoped_features]))
    pitch_mean = float(np.mean([item.pitch_confidence for item in scoped_features]))

    lane_motion = {
        "Left lane": float(np.mean([item.left_motion for item in scoped_features])),
        "Central lane": float(np.mean([item.center_motion for item in scoped_features])),
        "Right lane": float(np.mean([item.right_motion for item in scoped_features])),
    }
    zone = max(lane_motion, key=lane_motion.get)

    norm_motion = scale(motion_mean, stats["motion"])
    norm_edge = scale(edge_mean, stats["edge"])
    norm_line = scale(line_mean, stats["line"])
    norm_pitch = scale(pitch_mean, stats["pitch"])

    phase = estimate_phase(duration_sec, norm_motion, norm_edge)
    transition_type = estimate_transition_type(phase, norm_line, norm_edge)
    progression = _int_clamp(
        44
        + norm_motion * 32
        + norm_pitch * 12
        + min(duration_sec / 22.0, 1.0) * 14
        + (8 if zone == "Central lane" else 3),
        38,
        96,
    )
    pressure = _int_clamp(
        42 + norm_edge * 36 + norm_motion * 20 + (7 if phase == "Press resistance" else 0),
        32,
        98,
    )
    action_value = _int_clamp(
        46 + norm_line * 28 + norm_motion * 18 + min(duration_sec / 18.0, 1.0) * 12,
        40,
        97,
    )
    x_threat = round(
        _clamp(
            0.18
            + action_value / 160.0
            + norm_motion * 0.16
            + norm_line * 0.12,
            0.12,
            0.98,
        ),
        2,
    )
    passes = _int_clamp(3 + duration_sec / 2.6 + norm_motion * 4.0, 3, 14)

    signal_scores = build_signal_scores(
        zone=zone,
        phase=phase,
        norm_motion=norm_motion,
        norm_edge=norm_edge,
        norm_line=norm_line,
        duration_sec=duration_sec,
    )
    ordered_signals = sorted(signal_scores.items(), key=lambda item: item[1], reverse=True)
    primary_signal = ordered_signals[0][0]
    secondary_signals = [signal for signal, _ in ordered_signals[1:3]]
    outcome = estimate_outcome(phase, x_threat, norm_line, norm_motion)
    title = build_title(primary_signal, outcome)

    clip_url = urljoin(asset_base_url, clip_path.name)
    poster_url = urljoin(asset_base_url, poster_path.name)
    video_start_sec = round(start_sec, 2)
    video_end_sec = round(end_sec, 2)
    minute = int(video_start_sec // 60)

    confidence = round(
        _clamp(0.42 + norm_pitch * 0.26 + norm_motion * 0.22 + norm_line * 0.1, 0.35, 0.96),
        2,
    )

    return {
        "id": f"{options.job_id}-moment-{index + 1:02d}",
        "team": options.team_name,
        "title": title,
        "matchId": options.job_id,
        "matchLabel": f"{options.team_name} vs {options.opponent_name}",
        "date": options.match_date,
        "opponent": options.opponent_name,
        "venue": options.venue,
        "scoreline": options.scoreline,
        "minute": minute,
        "durationSec": round(duration_sec, 1),
        "gameState": options.game_state,
        "phase": phase,
        "zone": zone,
        "formation": estimate_formation(zone, phase, norm_edge),
        "transitionType": transition_type,
        "passes": passes,
        "progression": progression,
        "pressure": pressure,
        "actionValue": action_value,
        "xThreat": x_threat,
        "outcome": outcome,
        "players": build_players(primary_signal, phase),
        "primarySignal": primary_signal,
        "secondarySignals": secondary_signals,
        "signalScores": signal_scores,
        "note": build_note(zone, phase, duration_sec, norm_motion, norm_line),
        "whyItMatters": build_why_it_matters(primary_signal, outcome, pressure, x_threat),
        "path": build_path(zone, primary_signal, progression, duration_sec),
        "videoClipUrl": clip_url,
        "videoPosterUrl": poster_url,
        "fullVideoUrl": full_video_url,
        "videoStartSec": video_start_sec,
        "videoEndSec": video_end_sec,
        "analysisConfidence": confidence,
        "derivedFromVideo": True,
        "videoMomentScore": round(seed.moment_score, 2),
        "pitchConfidence": round(pitch_mean, 2),
        "videoSeedTimeSec": round(seed.time_sec, 2),
    }


def analyze_video(
    *,
    input_path: Path,
    job_dir: Path,
    options: AnalysisOptions,
    base_url: str,
) -> dict[str, Any]:
    metadata = probe_video(input_path)
    proxy_path = job_dir / "full.mp4"
    build_streamable_video(input_path, proxy_path)

    frame_dir = job_dir / "frames"
    sample_fps = analysis_fps(metadata.duration_sec)
    frame_paths = extract_frames(proxy_path, frame_dir, sample_fps)
    features = compute_frame_features(frame_paths, sample_fps)
    cut_boundaries = detect_cut_boundaries(features, metadata.duration_sec)
    stats = stats_from_features(features)
    seeds = select_seed_frames(features, metadata.duration_sec)
    candidate_windows = build_candidate_windows(seeds, cut_boundaries, metadata.duration_sec)

    asset_base_url = urljoin(base_url, f"assets/{options.job_id}/")
    full_video_url = urljoin(asset_base_url, proxy_path.name)
    possessions: list[dict[str, Any]] = []

    for index, (seed, start_sec, end_sec) in enumerate(candidate_windows):
        clip_path = job_dir / f"clip_{index + 1:02d}.mp4"
        poster_path = job_dir / f"poster_{index + 1:02d}.jpg"
        create_clip(proxy_path, clip_path, start_sec, end_sec)
        create_poster(proxy_path, poster_path, start_sec + (end_sec - start_sec) * 0.45)
        scoped_features = frames_in_window(features, start_sec, end_sec)
        possessions.append(
            build_possession(
                index=index,
                seed=seed,
                start_sec=start_sec,
                end_sec=end_sec,
                scoped_features=scoped_features,
                metadata=metadata,
                options=options,
                asset_base_url=asset_base_url,
                stats=stats,
                clip_path=clip_path,
                poster_path=poster_path,
                full_video_url=full_video_url,
            )
        )

    possessions.sort(key=lambda item: item["videoStartSec"])

    analysis = {
        "jobId": options.job_id,
        "datasetLabel": f"{options.team_name} video analysis",
        "analysisTeam": options.team_name,
        "availableTeams": [options.team_name],
        "fullVideoUrl": full_video_url,
        "possessions": possessions,
        "summary": {
            "competition": options.competition,
            "videoDurationSec": round(metadata.duration_sec, 1),
            "videoDurationLabel": f"{int(metadata.duration_sec // 60)}:{int(metadata.duration_sec % 60):02d}",
            "nativeFps": round(metadata.fps, 2),
            "analysisFps": sample_fps,
            "resolution": f"{metadata.width}x{metadata.height}",
            "momentCount": len(possessions),
            "averagePitchConfidence": round(
                float(np.mean([item.pitch_confidence for item in features])),
                2,
            ),
            "cutCount": max(0, len(cut_boundaries) - 2),
            "engine": "PitchLens local video engine",
            "processedOn": date.today().isoformat(),
        },
    }

    with (job_dir / "analysis.json").open("w", encoding="utf-8") as handle:
        json.dump(analysis, handle, indent=2)

    if frame_dir.exists():
        shutil.rmtree(frame_dir)

    return analysis
