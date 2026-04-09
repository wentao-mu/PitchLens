# PitchLens

PitchLens is a workflow-centered football analysis prototype. The primary MVP is event-first: it lets an analyst lock context filters, inspect summary signals, retrieve representative possessions, compare two matched opponent groups, and export an evidence-backed tactical note. The existing video workflow remains available as a secondary feature and can still turn broadcast footage into possessions for the same interface.

## MVP workflow

The default demo is built around this question:

> Compare the same team's build-up possessions against two opponents when the score is tied, within the first 30 minutes, starting from the defensive third.

The main screen supports:

- Context filters: opponent, score state, phase, start zone, lane, and minute range
- Pattern summary metrics: lane share, progression distance, passes before middle-third access, turnover-before-midline rate, and success-to-middle-third rate
- Representative retrieval: 3 to 5 possessions ranked with explicit why-selected reasons
- Fair comparison: side-by-side matched opponent groups with interpretable deltas
- Export: a Markdown tactical note with the question, active filters, findings, evidence, and conclusion

## What the system does

- Ingest one video file and cut playable tactical clips with a local FastAPI + ffmpeg pipeline
- Sample frames, score candidate moments, and convert them into PitchLens possessions with signal scores and comparison-ready metrics
- Play the extracted clip or jump back into the full source video from the same focused evidence panel
- Filter, rank, and compare clips across the same context lock
- Export a Markdown tactical note with linked clip evidence
- Ask a context-aware assistant about the current clip, comparison lock, or coaching takeaway
- Still supports CSV/JSON possession import and bundled StatsBomb-style demo data
- Supports free StatsBomb Open Data import through the local API

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

## AI assistant

The Deep Dive page includes a context-aware assistant. It reads the current analysis
view, including the active context lock, focused clip, comparison summary, and
export note.

- By default, it tries Ollama first with `gemma3:4b`.
- If you set `OPENAI_API_KEY`, the backend will call the OpenAI Responses API.
- You can override the model with `PITCHLENS_AI_MODEL` if needed.
- It can also use a free local model through Ollama. For example:

```bash
ollama serve
ollama pull gemma3:4b
export PITCHLENS_ASSISTANT_BACKEND=ollama
export PITCHLENS_OLLAMA_MODEL=gemma3:4b
npm run dev:api
```

- If you explicitly set `PITCHLENS_ASSISTANT_BACKEND=auto`, the backend tries OpenAI
  first and then Ollama before falling back to the built-in local summary.

You can also run them separately:

```bash
npm run dev:web
npm run dev:api
```

## Free real match data

The `Ingest` page can connect to free StatsBomb Open Data through the local FastAPI
backend. Use it to:

- load available competitions and seasons
- browse free match lists
- import one or more real event files directly into the event-first workflow

This flow uses the local endpoints:

- `GET /api/statsbomb/competitions`
- `GET /api/statsbomb/matches`
- `POST /api/statsbomb/import`

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

## Typecheck and tests

```bash
npm run typecheck
npm run test
```
