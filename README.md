# PitchLens

PitchLens is a workflow-centered football tactical analysis prototype. The system is already runnable as a local web app and is built around one main question:

> How can an analyst move from a broad tactical idea to a small, explainable set of possessions, compare matched contexts fairly, and export evidence-backed conclusions?

The current implementation supports an event-first analysis workflow as the primary path, while keeping video ingest and an AI assistant available as secondary extensions inside the same product surface.

## What is implemented

### Primary analysis workflow

PitchLens currently supports this end-to-end loop:

1. Lock explicit context filters
2. Inspect summary metrics and tactical signals
3. Retrieve representative possessions with why-selected reasons
4. Compare two matched possession groups side by side
5. Export an evidence-backed tactical note

### Data inputs

The prototype already supports multiple input paths:

- Synthetic bundled sample data
- Structured event import from local `CSV` / `JSON`
- Free real-match import through StatsBomb Open Data
- Bundled local video demo with precomputed clips
- Match video upload through a local FastAPI + `ffmpeg` pipeline

### Secondary implemented features

These are already present in the repo and should be treated as existing features, not future ideas:

- Video clip extraction from uploaded match footage
- A context-aware assistant that answers from the active analysis state
- Local assistant inference through Ollama / Gemma 3
- OpenAI-backed assistant replies when configured

## Main pages

The current UI is organized into five pages:

- `Overview`
  Current dataset, active lock, active signal, current comparison, and headline evidence
- `Ingest`
  Video upload, structured event import, and free StatsBomb Open Data import
- `Filters`
  Explicit context constraints plus the retrieval weighting formula
- `Scenarios`
  Summary metrics, presets, signal selection, and opponent board
- `Deep Dive`
  Ranked possessions, pitch or video inspection, sequence and context detail, comparison, export, and assistant

## Standard demo path

On startup, PitchLens opens on the bundled curated sample dataset by default. This keeps the first-run experience stable and preserves the more readable hand-authored example possessions. Real-match data, free StatsBomb Open Data, and video input remain available through `Ingest`.

The most reliable demo path is:

1. Start from the curated sample on `Overview`
2. Move to `Filters` and confirm the build-up context lock
3. Move to `Scenarios` and choose the signal to analyze
4. Move to `Deep Dive` to inspect representative possessions, compare two opponents, export a tactical note, and query the assistant
5. Use `Ingest` only if you want to replace the sample with the bundled real-match demo, free StatsBomb matches, structured files, or video input

For a concrete walkthrough, see [docs/demo-path.md](/Users/carl/codex%20project/cs6750/docs/demo-path.md).

## Quick start

Install frontend dependencies:

```bash
npm install
```

Set up the local Python API:

```bash
npm run setup:api
```

Run both services together:

```bash
npm run dev:full
```

This starts:

- Web app at `http://127.0.0.1:4173/`
- Local API at `http://127.0.0.1:8000/`

You can also run them separately:

```bash
npm run dev:web
npm run dev:api
```

## Validation commands

```bash
npm run typecheck
npm run test
npm run build
```

## Deployment

The repo now supports single-service deployment with Docker.

- The frontend is built with Vite during the Docker build.
- The FastAPI backend serves the built frontend from the same origin in production.
- Video assets are exposed from `/media/...`.

For Render:

1. Connect the repository.
2. Deploy the `render.yaml` blueprint or create a Docker web service from this repo.
3. Use the default start command from the `Dockerfile`.

After deploy, the app should be usable from one link without a separate API hostname.

## Free real-match import

The local API exposes a free StatsBomb Open Data path:

- `GET /api/statsbomb/competitions`
- `GET /api/statsbomb/matches`
- `POST /api/statsbomb/import`

Use this when you want the cleanest event-first demo with real matches and no paid provider dependency.

## Video ingest

The `Ingest` page supports one uploaded match video at a time. The local backend:

- validates the file
- samples candidate moments
- cuts tactical clips
- converts them into possession-style evidence
- returns the result to the same analysis interface

There is also a bundled local video demo in `Ingest`. It uses a precomputed highlight package stored in the repo, so the demo path does not depend on live YouTube downloading.

Supported video types:

- `.mp4`
- `.mov`
- `.m4v`
- `.avi`
- `.mkv`
- `.webm`

## AI assistant

The `Deep Dive` page includes a context-aware assistant. It answers from the current analysis state, including:

- current context lock
- focused possession
- ranked representative evidence
- current comparison summary
- exported tactical note

Supported assistant modes:

- local fallback summary mode
- Ollama local model mode
- Gemma 3 via Ollama
- OpenAI when configured

## Project structure

- [src/App.tsx](/Users/carl/codex%20project/cs6750/src/App.tsx): main UI orchestration
- [src/lib/analytics.ts](/Users/carl/codex%20project/cs6750/src/lib/analytics.ts): event-first analysis logic
- [src/lib/dataImport.ts](/Users/carl/codex%20project/cs6750/src/lib/dataImport.ts): structured data ingestion and normalization
- [src/lib/openDataApi.ts](/Users/carl/codex%20project/cs6750/src/lib/openDataApi.ts): free StatsBomb API client
- [src/lib/videoApi.ts](/Users/carl/codex%20project/cs6750/src/lib/videoApi.ts): frontend video ingest client
- [src/lib/assistantApi.ts](/Users/carl/codex%20project/cs6750/src/lib/assistantApi.ts): assistant client
- [server/main.py](/Users/carl/codex%20project/cs6750/server/main.py): local FastAPI entry point
- [server/video_analysis.py](/Users/carl/codex%20project/cs6750/server/video_analysis.py): video-to-evidence pipeline
- [server/assistant.py](/Users/carl/codex%20project/cs6750/server/assistant.py): assistant backend

## Known boundaries

PitchLens is already a working prototype, but it is still a research-oriented system rather than a polished production platform.

Current boundaries:

- The primary workflow is event-first
- Video and assistant features are implemented, but they are extensions around the same main workflow
- The frontend still centralizes a large amount of orchestration inside `src/App.tsx`
- The best current path for stable demo and evaluation is still the event-first real-data workflow
