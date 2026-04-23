// matharena/math-arena.js  (Math Arena router)
// Handles blitz / survival / daily modes from the local problem bank.
// All Elo is stored in `solver_rating` — the single source of truth shared
// with the Explore feed (challenges/challenges.js in the main router).

const express      = require("express");
const router       = express.Router();
const path         = require("path");
const fs           = require("fs");
const { ObjectId } = require("mongodb");

// ─── Problem bank ─────────────────────────────────────────────────────────────
const PROBLEMS = JSON.parse(
  fs.readFileSync(path.join(__dirname, "/matharena-engine/problem-bank.json"), "utf-8")
);

// Support id, _id, or problemId field names in the JSON
const PROBLEMS_BY_ID = Object.fromEntries(
  PROBLEMS.map(p => [p.id ?? p._id ?? p.problemId, p])
);

// ─── Rating baseline ──────────────────────────────────────────────────────────
const BASE_RATING = 800;

const DIFFICULTY_RATING = {
  easy:       900,
  medium:     1050,
  hard:       1300,
  impossible: 1700,
};

const DIFF_K_MULT = { easy: 0.6, medium: 1.0, hard: 1.6, impossible: 2.4 };
const MODE_MULT   = { classic: 0.55, blitz: 0.18, survival: 0.35, daily: 0.30 };

const DAILY_COMPLETION_BONUS = 12;
const DAILY_COUNT            = 5;

const MAX_ELO_HISTORY    = 200;
const MAX_RECENT_MATCHES = 100;

// ─── Dynamic K based on current rating ───────────────────────────────────────
function baseK(rating) {
  if (rating < 1000) return 20;
  if (rating < 1300) return 16;
  if (rating < 1600) return 12;
  return 8;
}

// ─── ELO delta calculation ────────────────────────────────────────────────────
function calcEloDelta({ solverRating, oppRating, correct, difficulty, mode }) {
  const expected  = 1 / (1 + Math.pow(10, (oppRating - solverRating) / 400));
  const scored    = correct ? 1 : 0;
  const k         = baseK(solverRating)
                  * (DIFF_K_MULT[difficulty] ?? 1.0)
                  * (MODE_MULT[mode]         ?? 0.35);

  let delta = k * (scored - expected);
  if (!correct) delta *= 1.4;
  return Math.round(delta);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const todayStr     = () => new Date().toISOString().slice(0, 10);
const yesterdayStr = () => new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

function requireAuth(req, res, next) {
  const jwt   = require("jsonwebtoken");
  const token = req.cookies?.accessToken;
  if (!token) {
    if (req.accepts("html")) return res.redirect("/auth");
    return res.status(401).json({ success: false, message: "Not authenticated" });
  }
  try {
    req.user = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
    next();
  } catch {
    res.status(401).json({ success: false, message: "Token expired" });
  }
}

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
    byTopic:       {},
  };
}

function mergeWithDefaults(stored, defaults) {
  const result = { ...defaults };
  for (const key of Object.keys(defaults)) {
    if (stored[key] === undefined) continue;
    if (Array.isArray(defaults[key])) {
      result[key] = stored[key];
    } else if (key === "byTopic") {
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

// GET /matharena/problems
router.get("/problems", requireAuth, async (req, res) => {
  try {
    const usersCol = req.app.locals.usersCollection;
    const user = await usersCol.findOne(
      { _id: new ObjectId(req.user.userId) },
      { projection: { seenProblemIds: 1 } }
    );
    const seen   = new Set(user?.seenProblemIds ?? []);
    const unseen = PROBLEMS.filter(p => !seen.has(p.id ?? p._id ?? p.problemId));
    res.json(unseen.length > 0 ? unseen : PROBLEMS);
  } catch (err) {
    console.error("GET /matharena/problems:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// GET /matharena/elo
// Returns ELO for authenticated users; returns guest:true for unauthenticated
// Does NOT redirect — always returns JSON so the frontend can detect auth state.
router.get("/elo", async (req, res) => {
  try {
    const jwt   = require("jsonwebtoken");
    const token = req.cookies?.accessToken;

    if (!token) {
      return res.json({ success: true, elo: BASE_RATING, guest: true });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
    } catch {
      // Expired or invalid token → treat as guest
      return res.json({ success: true, elo: BASE_RATING, guest: true });
    }

    const usersCol = req.app.locals.usersCollection;
    const user = await usersCol.findOne(
      { _id: new ObjectId(decoded.userId) },
      { projection: { solver_rating: 1 } }
    );
    res.json({ success: true, elo: user?.solver_rating ?? BASE_RATING, guest: false });
  } catch (err) {
    console.error("GET /matharena/elo:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// GET /matharena/stats
router.get("/stats", requireAuth, async (req, res) => {
  try {
    const usersCol = req.app.locals.usersCollection;
    const user = await usersCol.findOne(
      { _id: new ObjectId(req.user.userId) },
      { projection: { solver_rating: 1, stats: 1 } }
    );
    const stats = mergeWithDefaults(user?.stats ?? {}, buildDefaultStats());
    res.json({ success: true, elo: user?.solver_rating ?? BASE_RATING, stats });
  } catch (err) {
    console.error("GET /matharena/stats:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// GET /matharena/problems-bank
router.get("/problems-bank", (req, res) => {
  res.json(PROBLEMS);
});

// GET /matharena/daily-status
router.get("/daily-status", requireAuth, async (req, res) => {
  try {
    const usersCol = req.app.locals.usersCollection;
    const user = await usersCol.findOne(
      { _id: new ObjectId(req.user.userId) },
      { projection: { "stats.daily": 1 } }
    );
    const daily       = user?.stats?.daily ?? {};
    const completed   = daily.lastCompleted === todayStr();
    const midnight    = new Date(); midnight.setHours(24, 0, 0, 0);
    const nextResetMs = midnight.getTime() - Date.now();
    res.json({
      success:        true,
      completed,
      completedAt:    daily.lastCompletedAt ?? null,
      nextResetMs,
      streak:         daily.streak          ?? 0,
      totalCompleted: daily.totalCompleted   ?? 0,
      bestScore:      daily.bestScore        ?? 0,
    });
  } catch (err) {
    console.error("GET /matharena/daily-status:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// POST /matharena/submit
// Records one answer, updates solver_rating, marks problem as seen.
// body: { problemId, correct, mode }
router.post("/submit", requireAuth, async (req, res) => {
  try {
    const { problemId, correct, mode = "classic" } = req.body;

    // `correct` is required; `problemId` is optional (falls back to medium difficulty)
    if (typeof correct === "undefined" || correct === null) {
      return res.status(400).json({ success: false, message: "correct is required" });
    }

    const usersCol = req.app.locals.usersCollection;
    const user = await usersCol.findOne(
      { _id: new ObjectId(req.user.userId) },
      { projection: { solver_rating: 1, stats: 1 } }
    );

    const currentRating = user?.solver_rating ?? BASE_RATING;
    const prevStats     = mergeWithDefaults(user?.stats ?? {}, buildDefaultStats());

    if (mode === "daily" && prevStats.daily.lastCompleted === todayStr()) {
      return res.json({
        success:   false,
        blocked:   true,
        message:   "Daily already completed today",
        eloBefore: currentRating,
        eloAfter:  currentRating,
        eloDelta:  0,
      });
    }

    // Resolve problem — support numeric id, string id, or undefined
    const resolvedId = problemId != null ? Number(problemId) : null;
    const prob       = resolvedId != null ? PROBLEMS_BY_ID[resolvedId] : null;
    const difficulty = prob?.difficulty ?? "medium";
    const topic      = prob?.topic      ?? "Unknown";
    const oppRating  = DIFFICULTY_RATING[difficulty] ?? DIFFICULTY_RATING.medium;

    const eloDelta  = calcEloDelta({ solverRating: currentRating, oppRating, correct: !!correct, difficulty, mode });
    const newRating = Math.max(BASE_RATING, currentRating + eloDelta);

    const diffKey = ["easy","medium","hard","impossible"].includes(difficulty) ? difficulty : "medium";
    const modeKey = ["classic","blitz","survival","daily"].includes(mode)      ? mode       : "classic";

    const newEloHistory = [
      ...prevStats.eloHistory,
      { elo: newRating, mode, difficulty, topic, correct: !!correct, delta: eloDelta, ts: Date.now() },
    ].slice(-MAX_ELO_HISTORY);

    const newRecentMatches = [
      ...prevStats.recentMatches,
      { difficulty, topic, mode, correct: !!correct, delta: eloDelta, eloBefore: currentRating, eloAfter: newRating, ts: Date.now() },
    ].slice(-MAX_RECENT_MATCHES);

    const prevTopic  = prevStats.byTopic[topic] ?? { attempted: 0, correct: 0 };
    const newByTopic = {
      ...prevStats.byTopic,
      [topic]: {
        attempted: prevTopic.attempted + 1,
        correct:   prevTopic.correct + (correct ? 1 : 0),
      },
    };

    const updateOps = {
      $set: {
        solver_rating:                                    newRating,
        [`stats.byDifficulty.${diffKey}.attempted`]:     prevStats.byDifficulty[diffKey].attempted + 1,
        [`stats.byDifficulty.${diffKey}.correct`]:       prevStats.byDifficulty[diffKey].correct   + (correct ? 1 : 0),
        [`stats.byMode.${modeKey}.attempted`]:            prevStats.byMode[modeKey].attempted + 1,
        [`stats.byMode.${modeKey}.correct`]:              prevStats.byMode[modeKey].correct   + (correct ? 1 : 0),
        "stats.totals.attempted":                         prevStats.totals.attempted + 1,
        "stats.totals.correct":                           prevStats.totals.correct   + (correct ? 1 : 0),
        "stats.eloHistory":                               newEloHistory,
        "stats.recentMatches":                            newRecentMatches,
        "stats.byTopic":                                  newByTopic,
      },
    };

    // Only add to seen set if we have a valid problem id
    if (resolvedId != null) {
      updateOps.$addToSet = { seenProblemIds: resolvedId };
    }

    await usersCol.updateOne(
      { _id: new ObjectId(req.user.userId) },
      updateOps
    );

    res.json({
      success:   true,
      problemId: resolvedId,
      correct:   !!correct,
      mode,
      topic,
      difficulty,
      eloBefore: currentRating,
      eloAfter:  newRating,
      eloDelta,
    });
  } catch (err) {
    console.error("POST /matharena/submit:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// POST /matharena/session-end
router.post("/session-end", requireAuth, async (req, res) => {
  try {
    const { mode, correct = 0, attempted = 0, bestStreak = 0, dailyScore = 0 } = req.body;

    if (!["blitz","survival","daily"].includes(mode)) {
      return res.status(400).json({ success: false, message: "Invalid mode" });
    }

    const usersCol = req.app.locals.usersCollection;
    const user = await usersCol.findOne(
      { _id: new ObjectId(req.user.userId) },
      { projection: { solver_rating: 1, stats: 1 } }
    );

    const currentRating = user?.solver_rating ?? BASE_RATING;
    const prevStats     = mergeWithDefaults(user?.stats ?? {}, buildDefaultStats());
    const $set          = {};
    let   eloBonus      = 0;

    if (mode === "blitz") {
      const prev = prevStats.byMode.blitz;
      $set["stats.byMode.blitz.gamesPlayed"] = prev.gamesPlayed + 1;
      $set["stats.byMode.blitz.bestScore"]   = Math.max(prev.bestScore,       correct);
      $set["stats.byMode.blitz.bestStreak"]  = Math.max(prev.bestStreak ?? 0, bestStreak);
      $set["stats.byMode.blitz.totalTime"]   = (prev.totalTime ?? 0) + 60;
    }

    if (mode === "survival") {
      const prev = prevStats.byMode.survival;
      $set["stats.byMode.survival.gamesPlayed"] = prev.gamesPlayed + 1;
      $set["stats.byMode.survival.bestScore"]   = Math.max(prev.bestScore,       attempted);
      $set["stats.byMode.survival.bestStreak"]  = Math.max(prev.bestStreak ?? 0, bestStreak);
    }

    if (mode === "daily") {
      if (prevStats.daily.lastCompleted === todayStr()) {
        return res.json({ success: false, blocked: true, message: "Daily already completed today" });
      }

      const prev      = prevStats.daily;
      const today     = todayStr();
      const newStreak = prev.lastCompleted === yesterdayStr() ? prev.streak + 1 : 1;

      const ratingMult = currentRating < 1000 ? 1.0
                       : currentRating < 1300 ? 0.8
                       : currentRating < 1600 ? 0.6
                       : 0.4;
      eloBonus = Math.round(DAILY_COMPLETION_BONUS * (dailyScore / DAILY_COUNT) * ratingMult);
      const newRating = Math.max(BASE_RATING, currentRating + eloBonus);

      const bonusEntry = { elo: newRating, mode: "daily_bonus", delta: eloBonus, ts: Date.now() };
      const newEloHistory = [...prevStats.eloHistory, bonusEntry].slice(-MAX_ELO_HISTORY);

      $set["solver_rating"]                      = newRating;
      $set["stats.eloHistory"]                   = newEloHistory;
      $set["stats.daily.lastCompleted"]          = today;
      $set["stats.daily.lastCompletedAt"]        = Date.now();
      $set["stats.daily.streak"]                 = newStreak;
      $set["stats.daily.totalCompleted"]         = (prev.totalCompleted ?? 0) + 1;
      $set["stats.daily.bestScore"]              = Math.max(prev.bestScore ?? 0, dailyScore);
      $set["stats.byMode.daily.gamesPlayed"]     = (prevStats.byMode.daily.gamesPlayed ?? 0) + 1;
      $set["stats.byMode.daily.bestScore"]       = Math.max(prevStats.byMode.daily.bestScore ?? 0, dailyScore);
    }

    if (Object.keys($set).length) {
      await usersCol.updateOne({ _id: new ObjectId(req.user.userId) }, { $set });
    }

    res.json({ success: true, mode, eloBonus, newRating: currentRating + eloBonus });
  } catch (err) {
    console.error("POST /matharena/session-end:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// GET /matharena/seen
router.get("/seen", requireAuth, async (req, res) => {
  try {
    const usersCol = req.app.locals.usersCollection;
    const user = await usersCol.findOne(
      { _id: new ObjectId(req.user.userId) },
      { projection: { seenProblemIds: 1 } }
    );
    if (!user) return res.status(404).json({ success: false, message: "User not found" });
    res.json({ success: true, seen: user.seenProblemIds ?? [] });
  } catch (err) {
    console.error("GET /matharena/seen:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// POST /matharena/seen
router.post("/seen", requireAuth, async (req, res) => {
  const { id } = req.body;
  if (id === undefined || id === null)
    return res.status(400).json({ success: false, message: "Problem id required" });

  try {
    const usersCol = req.app.locals.usersCollection;
    await usersCol.updateOne(
      { _id: new ObjectId(req.user.userId) },
      { $addToSet: { seenProblemIds: Number(id) } }
    );
    res.json({ success: true });
  } catch (err) {
    console.error("POST /matharena/seen:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// DELETE /matharena/seen
router.delete("/seen", requireAuth, async (req, res) => {
  try {
    const usersCol = req.app.locals.usersCollection;
    await usersCol.updateOne(
      { _id: new ObjectId(req.user.userId) },
      { $set: { seenProblemIds: [] } }
    );
    res.json({ success: true });
  } catch (err) {
    console.error("DELETE /matharena/seen:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

module.exports = router;