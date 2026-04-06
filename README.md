# PitchLens

PitchLens is now a runnable local system for tactical analysis from broadcast video. You can upload a match clip or full game video, let the local engine extract candidate moments, and work from those clips through ranking, comparison, and note export inside the web UI.

## What the system does

- Ingest one video file and cut playable tactical clips with a local FastAPI + ffmpeg pipeline
- Sample frames, score candidate moments, and convert them into PitchLens possessions with signal scores and comparison-ready metrics
- Play the extracted clip or jump back into the full source video from the same focused evidence panel
- Filter, rank, and compare clips across the same context lock
- Export a Markdown tactical note with linked clip evidence
- Still supports CSV/JSON possession import and bundled StatsBomb-style demo data

## Stack

- Frontend: Vite, React, TypeScript
- Video engine: FastAPI, ffmpeg/ffprobe, Pillow, NumPy
- Static demo data: bundled under `public/demo/`

## Local setup

Install frontend dependencies:

```bash
npm install
```

Set up the Python video engine:

```bash
npm run setup:api
```

Run both services together:

```bash
npm run dev:full
```

This starts:

- Web UI at `http://127.0.0.1:4173/`
- Video API at `http://127.0.0.1:8000/`

You can also run them separately:

```bash
npm run dev:web
npm run dev:api
```

## Video workflow

1. Open the `Ingest` panel.
2. Fill in team, opponent, competition, venue, and score context.
3. Upload one `mp4`, `mov`, `m4v`, `avi`, `mkv`, or `webm` file.
4. PitchLens will:
   - transcode a streamable master video
   - sample frames from the feed
   - score candidate tactical moments
   - cut playable clips and posters
   - return a possession-style evidence set to the UI
5. Use the focus panel to switch between `Clip` and `Full match`.

Generated video assets and analysis JSON are stored under:

- `server/output/<job-id>/`

## Structured data workflow

If you already have event data, the UI also accepts:

- PitchLens possession schema CSV
- PitchLens possession schema JSON
- StatsBomb-style raw event JSON arrays

Use `Load Arsenal WFC demo` to load bundled public event data from:

- `public/demo/statsbomb-arsenal-wfc/manifest.json`
- `public/demo/statsbomb-arsenal-wfc/*.json`

## Build

```bash
npm run build
```
