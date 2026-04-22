# PitchLens Demo Path

This document defines the standard demo route for the current prototype. Use it for class presentations, video recording, and screenshots so the product story stays consistent.

By default, the app boots into the bundled curated sample dataset. This keeps the opening state readable and presentation-friendly while still leaving the bundled real-match demo, StatsBomb import, and video input available in `Ingest`.

## Recommended route

Page order:

1. `Overview`
2. `Filters`
3. `Scenarios`
4. `Deep Dive`
5. `Ingest` when you want to show alternate input paths

## Best demo setup

Use the default curated sample unless you specifically want to show data replacement or real-match import.

Recommended setup:

1. Start from the bundled curated sample
2. Start on `Overview`
3. Keep the default build-up context lock
4. Move through `Filters`, `Scenarios`, and `Deep Dive`
5. Only enter `Ingest` if you want to replace the default sample with the bundled real-match demo, free StatsBomb data, structured files, or video

This gives you the most stable path for:

- context filtering
- representative retrieval
- fair comparison
- tactical note export
- assistant Q&A

## Suggested narration by page

### Overview

Show:

- current dataset
- current lock
- active signal
- current comparison
- headline evidence

Point:

- the system is already organized around a complete analyst workflow, not isolated charts

### Ingest

Show:

- structured event import
- free StatsBomb Open Data import
- bundled local video demo
- video upload

Point:

- the primary workflow is event-first, but the product can also load a bundled video demo or ingest uploaded video and convert it into the same evidence model

### Filters

Show:

- opponent
- score state
- phase
- start zone
- lane
- minute range
- retrieval formula

Point:

- all later evidence and comparison views are grounded in explicit constraints

### Scenarios

Show:

- summary metrics
- scenario presets
- signal cards
- opponent board

Point:

- this page turns the current context into an interpretable tactical hypothesis space

### Deep Dive

Show:

- ranked representative possessions
- pitch or video switch
- sequence and context tabs
- side-by-side comparison
- tactical note export
- assistant

Point:

- this is where summary becomes evidence, comparison, and exportable output

## If time is short

Use this compact route:

1. `Overview`: show active dataset, lock, signal, and headline evidence
2. `Scenarios`: choose one signal
3. `Deep Dive`: inspect one possession, compare two opponents, export note

## If you want to include video

Only do this after the event-first route is already clear.

Recommended order:

1. Finish the default event-first demo first
2. Go to `Ingest`
3. Load the bundled video demo, or upload one video
4. Show that the extracted clips re-enter the same interface and can be analyzed with the same downstream workflow

## Screenshot priorities

If you need a compact set of screenshots, prioritize these:

1. `Overview` with active dataset, lock, signal, and comparison visible
2. `Scenarios` with summary metrics and signal cards
3. `Deep Dive` with one focused possession plus comparison and export visible

If adding a fourth screenshot:

4. `Ingest` with free StatsBomb Open Data import visible
