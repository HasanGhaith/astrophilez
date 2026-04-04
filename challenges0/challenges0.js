// challenges/challenges.js
const express  = require("express");
const router   = express.Router();
const path     = require("path");
const fs       = require("fs");
const { ObjectId } = require("mongodb");

// ─── Load problem bank from local JSON file ───────────────────────────────────
// problem-bank.json must sit in the same directory as this file (challenges/)
const PROBLEMS = JSON.parse(
  fs.readFileSync(path.join(__dirname, "problem-bank.json"), "utf-8")
);
// Build a quick lookup map by problem id for O(1) access in /submit
const PROBLEMS_BY_ID = Object.fromEntries(PROBLEMS.map(p => [p.id, p]));

// ─── ELO config ──────────────────────────────────────────────────────────────
const DIFFICULTY_RATING = { easy: 1200, medium: 1500, hard: 1800, impossible: 2100 };
const K_FACTOR          = 32;
const DIFF_K_MULT       = { easy: 0.5, medium: 1, hard: 2, impossible: 3 };

// ─── Mode ELO multipliers ─────────────────────────────────────────────────────
// Classic  → 1.0   full ranked ELO
// Blitz    → 0.25  fast-paced, many answers per minute → capped to avoid inflation
// Survival → 0.6   moderate, fewer wrong-answer penalties
// Daily    → 0.5   per-problem; plus a flat completion bonus at session-end
const MODE_ELO_MULT = { classic: 1.0, blitz: 0.25, survival: 0.6, daily: 0.5 };

// Flat ELO bonus when a daily is fully finished (scaled by score: 5/5 = full bonus)
const DAILY_COMPLETION_BONUS = 50;
const DAILY_COUNT            = 5;

// Rolling history caps
const MAX_ELO_HISTORY    = 200;
const MAX_RECENT_MATCHES = 100;

// ─── Helpers ─────────────────────────────────────────────────────────────────
const todayStr     = () => new Date().toISOString().slice(0, 10);
const yesterdayStr = () => new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

function requireAuth(req, res, next) {
  if (!req.session?.userId) {
    if (req.accepts("html")) return res.redirect("/auth");
    return res.status(401).json({ success: false, message: "Not logged in" });
  }
  next();
}

// Deep-merge stored stats with the default schema so new fields always exist
function buildDefaultStats() {
  return {
    totals: { attempted: 0, correct: 0 },
    byDifficulty: {
      easy:       { attempted: 0, correct: 0 },
      medium:     { attempted: 0, correct: 0 },
      hard:       { attempted: 0, correct: 0 },
      impossible: { attempted: 0, correct: 0 },
    },
    byMode: {
      classic:  { attempted: 0, correct: 0, gamesPlayed: 0 },
      blitz:    { attempted: 0, correct: 0, gamesPlayed: 0, bestScore: 0, bestStreak: 0, totalTime: 0 },
      survival: { attempted: 0, correct: 0, gamesPlayed: 0, bestScore: 0, bestStreak: 0 },
      daily:    { attempted: 0, correct: 0, gamesPlayed: 0, bestScore: 0 },
    },
    daily: {
      lastCompleted:   null,
      lastCompletedAt: null,
      streak:          0,
      totalCompleted:  0,
      bestScore:       0,
    },
    eloHistory:    [],
    recentMatches: [],
    // byTopic is a free-form map: { [topicName]: { attempted, correct } }
    // Keys are created on-the-fly as new topics are encountered.
    byTopic: {},
  };
}

function mergeWithDefaults(stored, defaults) {
  const result = { ...defaults };
  for (const key of Object.keys(defaults)) {
    if (stored[key] === undefined) continue;
    if (Array.isArray(defaults[key])) {
      result[key] = stored[key];
    } else if (key === "byTopic") {
      // Free-form map — just carry it over wholesale
      result[key] = stored[key] ?? {};
    } else if (typeof defaults[key] === "object" && defaults[key] !== null) {
      result[key] = mergeWithDefaults(stored[key] ?? {}, defaults[key]);
    } else {
      result[key] = stored[key];
    }
  }
  return result;
}

// ─── Routes ──────────────────────────────────────────────────────────────────

router.get("/", requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, "../public/challenges.html"));
});

// GET /challenges/problems  — served from the local JSON file, excluding already-seen problems
router.get("/problems", requireAuth, async (req, res) => {
  try {
    const user = await req.app.locals.usersCollection.findOne(
      { _id: new ObjectId(req.session.userId) },
      { projection: { seenProblemIds: 1 } }
    );
    const seen    = new Set(user?.seenProblemIds ?? []);
    const unseen  = PROBLEMS.filter(p => !seen.has(p.id));
    // If the user has seen every problem, silently reset so they cycle through again
    res.json(unseen.length > 0 ? unseen : PROBLEMS);
  } catch (err) {
    console.error("GET /challenges/problems:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// GET /challenges/elo
router.get("/elo", requireAuth, async (req, res) => {
  try {
    const user = await req.app.locals.usersCollection.findOne(
      { _id: new ObjectId(req.session.userId) },
      { projection: { elo: 1 } }
    );
    res.json({ success: true, elo: user?.elo ?? 1500 });
  } catch (err) {
    console.error("GET /challenges/elo:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// GET /challenges/stats  — all data the dashboard will need
router.get("/stats", requireAuth, async (req, res) => {
  try {
    const user = await req.app.locals.usersCollection.findOne(
      { _id: new ObjectId(req.session.userId) },
      { projection: { elo: 1, stats: 1 } }
    );
    const stats = mergeWithDefaults(user?.stats ?? {}, buildDefaultStats());
    res.json({ success: true, elo: user?.elo ?? 1500, stats });
  } catch (err) {
    console.error("GET /challenges/stats:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// GET /challenges/daily-status  — server-side daily lock check
router.get("/daily-status", requireAuth, async (req, res) => {
  try {
    const user = await req.app.locals.usersCollection.findOne(
      { _id: new ObjectId(req.session.userId) },
      { projection: { "stats.daily": 1 } }
    );
    const daily       = user?.stats?.daily ?? {};
    const completed   = daily.lastCompleted === todayStr();
    const midnight    = new Date(); midnight.setHours(24, 0, 0, 0);
    const nextResetMs = midnight.getTime() - Date.now();
    res.json({
      success:        true,
      completed,
      completedAt:    daily.lastCompletedAt    ?? null,
      nextResetMs,
      streak:         daily.streak             ?? 0,
      totalCompleted: daily.totalCompleted      ?? 0,
      bestScore:      daily.bestScore           ?? 0,
    });
  } catch (err) {
    console.error("GET /challenges/daily-status:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// POST /challenges/submit  — record one answer, update ELO
// body: { problemId, correct, mode }
router.post("/submit", requireAuth, async (req, res) => {
  try {
    const { problemId, correct, mode = "classic" } = req.body;
    if (typeof problemId === "undefined" || typeof correct === "undefined") {
      return res.status(400).json({ success: false, message: "problemId and correct required" });
    }

    const usersCol = req.app.locals.usersCollection;
    const user     = await usersCol.findOne(
      { _id: new ObjectId(req.session.userId) },
      { projection: { elo: 1, stats: 1 } }
    );

    const currentElo = user?.elo ?? 1500;
    const prevStats  = mergeWithDefaults(user?.stats ?? {}, buildDefaultStats());

    // Server-side guard: if daily already done today, block silently
    if (mode === "daily" && prevStats.daily.lastCompleted === todayStr()) {
      return res.json({ success: false, blocked: true, message: "Daily already completed today", eloBefore: currentElo, eloAfter: currentElo, eloDelta: 0 });
    }

    // Look up problem difficulty + topic from the local JSON bank
    const prob       = PROBLEMS_BY_ID[Number(problemId)];
    const difficulty = prob?.difficulty ?? "medium";
    const topic      = prob?.topic      ?? "Unknown";
    const oppRating  = DIFFICULTY_RATING[difficulty] ?? DIFFICULTY_RATING.medium;

    // ELO = K * diffMult * modeMult * (scored - expected)
    const scored   = correct ? 1 : 0;
    const expected = 1 / (1 + Math.pow(10, (oppRating - currentElo) / 400));
    const modeMult = MODE_ELO_MULT[mode] ?? 1.0;
    const k        = K_FACTOR * (DIFF_K_MULT[difficulty] ?? 1) * modeMult;
    const newElo   = currentElo + k * (scored - expected);
    const eloDelta = Math.round(newElo) - Math.round(currentElo);

    const diffKey  = ["easy","medium","hard","impossible"].includes(difficulty) ? difficulty : "medium";
    const modeKey  = ["classic","blitz","survival","daily"].includes(mode) ? mode : "classic";

    const newEloHistory = [
      ...prevStats.eloHistory,
      { elo: Math.round(newElo), mode, difficulty, topic, correct: !!correct, delta: eloDelta, ts: Date.now() },
    ].slice(-MAX_ELO_HISTORY);

    const newRecentMatches = [
      ...prevStats.recentMatches,
      { difficulty, topic, mode, correct: !!correct, delta: eloDelta, eloBefore: Math.round(currentElo), eloAfter: Math.round(newElo), ts: Date.now() },
    ].slice(-MAX_RECENT_MATCHES);

    // Compute updated byTopic entry for this topic
    const prevTopic  = prevStats.byTopic[topic] ?? { attempted: 0, correct: 0 };
    const newByTopic = {
      ...prevStats.byTopic,
      [topic]: {
        attempted: prevTopic.attempted + 1,
        correct:   prevTopic.correct   + (correct ? 1 : 0),
      },
    };

    await usersCol.updateOne(
      { _id: new ObjectId(req.session.userId) },
      {
        $set: {
          elo:                                              newElo,
          [`stats.byDifficulty.${diffKey}.attempted`]:     prevStats.byDifficulty[diffKey].attempted + 1,
          [`stats.byDifficulty.${diffKey}.correct`]:       prevStats.byDifficulty[diffKey].correct   + (correct ? 1 : 0),
          [`stats.byMode.${modeKey}.attempted`]:            prevStats.byMode[modeKey].attempted        + 1,
          [`stats.byMode.${modeKey}.correct`]:              prevStats.byMode[modeKey].correct           + (correct ? 1 : 0),
          "stats.totals.attempted":                         prevStats.totals.attempted + 1,
          "stats.totals.correct":                           prevStats.totals.correct   + (correct ? 1 : 0),
          "stats.eloHistory":                               newEloHistory,
          "stats.recentMatches":                            newRecentMatches,
          "stats.byTopic":                                  newByTopic,
        },
        $addToSet: { seenProblemIds: Number(problemId) },
      }
    );

    res.json({ success: true, problemId, correct: !!correct, mode, topic, eloBefore: currentElo, eloAfter: newElo, eloDelta, expected, modeMult });
  } catch (err) {
    console.error("POST /challenges/submit:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// POST /challenges/session-end  — called when blitz/survival/daily session ends
// body: { mode, correct, attempted, bestStreak, dailyScore }
router.post("/session-end", requireAuth, async (req, res) => {
  try {
    const { mode, correct = 0, attempted = 0, bestStreak = 0, dailyScore = 0 } = req.body;

    if (!["blitz","survival","daily"].includes(mode)) {
      return res.status(400).json({ success: false, message: "Invalid mode" });
    }

    const usersCol = req.app.locals.usersCollection;
    const user     = await usersCol.findOne(
      { _id: new ObjectId(req.session.userId) },
      { projection: { elo: 1, stats: 1 } }
    );

    const currentElo = user?.elo ?? 1500;
    const prevStats  = mergeWithDefaults(user?.stats ?? {}, buildDefaultStats());
    const $set       = {};
    let eloBonus     = 0;

    if (mode === "blitz") {
      const prev = prevStats.byMode.blitz;
      $set["stats.byMode.blitz.gamesPlayed"] = prev.gamesPlayed + 1;
      $set["stats.byMode.blitz.bestScore"]   = Math.max(prev.bestScore, correct);
      $set["stats.byMode.blitz.bestStreak"]  = Math.max(prev.bestStreak ?? 0, bestStreak);
      $set["stats.byMode.blitz.totalTime"]   = (prev.totalTime ?? 0) + 60;
    }

    if (mode === "survival") {
      const prev = prevStats.byMode.survival;
      $set["stats.byMode.survival.gamesPlayed"] = prev.gamesPlayed + 1;
      $set["stats.byMode.survival.bestScore"]   = Math.max(prev.bestScore, attempted);
      $set["stats.byMode.survival.bestStreak"]  = Math.max(prev.bestStreak ?? 0, bestStreak);
    }

    if (mode === "daily") {
      // Hard server-side guard — daily can only be completed once
      if (prevStats.daily.lastCompleted === todayStr()) {
        return res.json({ success: false, blocked: true, message: "Daily already completed today" });
      }

      const prev      = prevStats.daily;
      const today     = todayStr();
      const newStreak = prev.lastCompleted === yesterdayStr() ? prev.streak + 1 : 1;

      // Completion bonus scaled by score (0–5 correct → 0–50 ELO)
      eloBonus = Math.round(DAILY_COMPLETION_BONUS * (dailyScore / DAILY_COUNT));
      const newElo = currentElo + eloBonus;

      const bonusEntry = { elo: Math.round(newElo), mode: "daily_bonus", delta: eloBonus, ts: Date.now() };
      const newEloHistory = [...prevStats.eloHistory, bonusEntry].slice(-MAX_ELO_HISTORY);

      $set["elo"]                                  = newElo;
      $set["stats.eloHistory"]                     = newEloHistory;
      $set["stats.daily.lastCompleted"]            = today;
      $set["stats.daily.lastCompletedAt"]          = Date.now();
      $set["stats.daily.streak"]                   = newStreak;
      $set["stats.daily.totalCompleted"]           = (prev.totalCompleted ?? 0) + 1;
      $set["stats.daily.bestScore"]                = Math.max(prev.bestScore ?? 0, dailyScore);
      $set["stats.byMode.daily.gamesPlayed"]       = (prevStats.byMode.daily.gamesPlayed ?? 0) + 1;
      $set["stats.byMode.daily.bestScore"]         = Math.max(prevStats.byMode.daily.bestScore ?? 0, dailyScore);
    }

    if (Object.keys($set).length) {
      await usersCol.updateOne({ _id: new ObjectId(req.session.userId) }, { $set });
    }

    res.json({ success: true, mode, eloBonus, newElo: currentElo + eloBonus });
  } catch (err) {
    console.error("POST /challenges/session-end:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

module.exports = router;