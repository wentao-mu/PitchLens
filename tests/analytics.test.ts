import test from "node:test";
import assert from "node:assert/strict";

import { allPossessions } from "../src/data/sampleData";
import {
  comparePossessionGroups,
  defaultScenarioFilters,
  filterPossessions,
  recommendVideoFilters,
  retrieveRepresentativePossessions,
  selectDominantSignal,
} from "../src/lib/analytics";

test("descriptor derivation keeps the default scenario in the defensive third", () => {
  const scoped = filterPossessions(allPossessions, defaultScenarioFilters);

  assert.ok(scoped.length >= 6);
  assert.ok(scoped.every((possession) => possession.startZone === "Defensive third"));
  assert.ok(scoped.every((possession) => possession.phase === "Build-up"));
  assert.ok(scoped.every((possession) => possession.gameState === "Drawing"));
});

test("representative retrieval returns interpretable reasons and capped results", () => {
  const ranked = retrieveRepresentativePossessions(
    allPossessions,
    defaultScenarioFilters,
    "Left overload release",
    undefined,
    "en",
  );

  assert.ok(ranked.length >= 3);
  assert.ok(ranked.length <= 5);
  assert.ok(ranked.every((possession) => possession.retrievalReasons.length > 0));
  assert.equal(ranked[0].opponent, "Arsenal");
  assert.ok(
    ranked.some((possession) =>
      possession.retrievalReasons.some((reason) => reason.key === "diversity"),
    ),
  );
});

test("fair comparison exposes interpretable deltas between Arsenal and Liverpool", () => {
  const left = retrieveRepresentativePossessions(
    allPossessions,
    { ...defaultScenarioFilters, opponent: "Arsenal" },
    "Left overload release",
    undefined,
    "en",
  );
  const right = retrieveRepresentativePossessions(
    allPossessions,
    { ...defaultScenarioFilters, opponent: "Liverpool" },
    "Left overload release",
    undefined,
    "en",
  );
  const comparison = comparePossessionGroups(left, right, "Arsenal", "Liverpool", "en");

  const turnoverDelta = comparison.deltas.find(
    (delta) => delta.key === "turnoverBeforeMidlineRate",
  );
  const progressionDelta = comparison.deltas.find(
    (delta) => delta.key === "averageProgression",
  );

  assert.ok(turnoverDelta);
  assert.ok(progressionDelta);
  assert.equal(turnoverDelta?.winner, "left");
  assert.equal(progressionDelta?.winner, "left");
  assert.match(comparison.summary, /progress/i);
});

test("video defaults widen the lock to fit imported video moments", () => {
  const videoLike = allPossessions
    .filter((possession) => possession.opponent === "Liverpool")
    .slice(0, 3)
    .map((possession, index) => ({
      ...possession,
      minute: 40 + index * 5,
      phase: "Press resistance" as const,
    }));

  const filters = recommendVideoFilters(videoLike);
  const dominantSignal = selectDominantSignal(videoLike);

  assert.equal(filters.gameState, "Drawing");
  assert.equal(filters.phase, "All phases");
  assert.equal(filters.startZone, "All start zones");
  assert.equal(filters.zone, "All zones");
  assert.deepEqual(filters.minuteRange, [40, 50]);
  assert.equal(filters.timeWindow, "31-60");
  assert.equal(dominantSignal, "Press escape chain");
});
