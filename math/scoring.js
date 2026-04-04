// math/scoring.js
// Handles all point calculations for solvers and creators using the ELO Rating System.

// ══════════════════════════════════════════════════════════
// ELO CONFIGURATION
// ══════════════════════════════════════════════════════════
const BASE_RATING  = 800;
const FLOOR_RATING = 400;
const K_FACTOR     = 32;

// Difficulty tier (1–5) → representative Elo rating
const DIFFICULTY_TO_RATING = {
  1: 600,
  2: 800,
  3: 1000,
  4: 1300,
  5: 1600,
};

// ══════════════════════════════════════════════════════════
// INTERNAL HELPERS
// ══════════════════════════════════════════════════════════

/**
 * Returns true when `v` looks like a 1–5 difficulty label rather than
 * a real Elo number. We treat it as a label only when it is an integer
 * between 1 and 5 AND came in through a field whose name implies a label
 * (callers pass `difficulty`, not `rating`, for labels). This function is
 * purely defensive — callers should never pass a raw 1–5 Elo.
 */
function _isLabel(v) {
  return Number.isInteger(v) && v >= 1 && v <= 5;
}

/**
 * Resolve an Elo rating from either an explicit `rating` field or a
 * `difficulty` label fallback, with a final fallback to BASE_RATING.
 */
function _resolveRating(rating, difficulty) {
  // Prefer explicit numeric rating (must be > 5 to not be confused with a label)
  if (typeof rating === 'number' && rating > 5) return rating;
  // Fall back to difficulty label
  if (difficulty != null) return DIFFICULTY_TO_RATING[difficulty] ?? BASE_RATING;
  return BASE_RATING;
}

/**
 * Standard Elo expected-score formula.
 * E_a = 1 / (1 + 10^((R_b - R_a) / 400))
 */
function _expected(ratingA, ratingB) {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

// ══════════════════════════════════════════════════════════
// CALCULATE SOLVER REWARD (ELO UPDATE)
// ══════════════════════════════════════════════════════════

/**
 * @param {object} opts
 * @param {number}  opts.solverRating  - Current solver Elo (omit → BASE_RATING)
 * @param {number}  [opts.problemRating] - Problem's Elo (preferred over difficulty)
 * @param {number}  [opts.difficulty]   - Fallback 1–5 label if problemRating absent
 * @param {'win'|'loss'} opts.result    - Required. 'win' = correct, 'loss' = wrong.
 *
 * @returns {{ total: number, change: number, breakdown: object }}
 */
function calcSolverReward({ solverRating, problemRating, difficulty, result }) {
  // --- Input validation ---
  if (result !== 'win' && result !== 'loss') {
    throw new Error(`calcSolverReward: result must be 'win' or 'loss', got: ${JSON.stringify(result)}`);
  }

  const R_solver  = (typeof solverRating  === 'number' && solverRating  > 5) ? solverRating  : BASE_RATING;
  const R_problem = _resolveRating(problemRating, difficulty);

  const expectedScore = _expected(R_solver, R_problem);
  const actualScore   = result === 'win' ? 1 : 0;

  const rawChange = K_FACTOR * (actualScore - expectedScore);
  const clampedTotal = Math.max(FLOOR_RATING, R_solver + rawChange);

  // BUG FIX: report the *applied* delta, not the raw one.
  // If the floor kicks in, the real change is smaller (or zero).
  const appliedChange = Math.round(clampedTotal - R_solver);

  return {
    total:  Math.round(clampedTotal),
    change: appliedChange,
    breakdown: {
      previousRating:       R_solver,
      problemRating:        R_problem,
      expectedProbability:  +expectedScore.toFixed(4),
      outcome:              result,
      floorApplied:         clampedTotal !== R_solver + rawChange,
    },
  };
}

// ══════════════════════════════════════════════════════════
// CALCULATE CREATOR REWARD (PROBLEM RATING UPDATE)
// ══════════════════════════════════════════════════════════

/**
 * The problem is treated as the "player" here — it gains Elo when solvers
 * fail and loses Elo when solvers succeed.
 *
 * @param {object} opts
 * @param {number}  opts.problemRating  - Current problem Elo (omit → difficulty → BASE_RATING)
 * @param {number}  [opts.difficulty]   - Fallback 1–5 label
 * @param {number}  opts.solverRating   - Elo of the solver who just attempted
 * @param {boolean} opts.correct        - Did the solver answer correctly?
 *
 * @returns {{ total: number, change: number, reason: string }}
 */
function calcCreatorReward({ problemRating, difficulty, solverRating, correct }) {
  if (typeof correct !== 'boolean') {
    throw new Error(`calcCreatorReward: 'correct' must be a boolean, got: ${JSON.stringify(correct)}`);
  }

  const R_problem = _resolveRating(problemRating, difficulty);
  const R_solver  = (typeof solverRating === 'number' && solverRating > 5) ? solverRating : BASE_RATING;

  // Expected score for the *problem* (i.e. probability it "beats" the solver → solver fails)
  const expectedScore = _expected(R_problem, R_solver);

  // Problem wins (1) when solver is wrong; loses (0) when solver is right.
  const actualScore = correct ? 0 : 1;

  const rawChange    = K_FACTOR * (actualScore - expectedScore);
  const clampedTotal = Math.max(FLOOR_RATING, R_problem + rawChange);

  // BUG FIX: same applied-delta fix as calcSolverReward.
  const appliedChange = Math.round(clampedTotal - R_problem);

  return {
    total:  Math.round(clampedTotal),
    change: appliedChange,
    reason: correct ? 'solved_rating_drop' : 'failed_rating_gain',
    floorApplied: clampedTotal !== R_problem + rawChange,
  };
}

// ══════════════════════════════════════════════════════════
// ADJUST DIFFICULTY LABEL (Elo → 1–5 mapping)
// ══════════════════════════════════════════════════════════

/**
 * Maps a raw Elo number back to a 1–5 difficulty label.
 * If a 1–5 label is somehow passed in, it is returned as-is.
 *
 * @param {object} opts
 * @param {number} opts.currentRating - Elo value (or 1–5 label)
 * @returns {1|2|3|4|5}
 */
function adjustDifficulty({ currentRating }) {
  // BUG FIX: only treat as an already-resolved label when it is a 1–5 integer.
  // Previously this check used `<= 5`, which wrongly passed through ratings
  // of 1, 2, 3, 4, 5 (near-impossible in practice but still incorrect).
  if (_isLabel(currentRating)) return currentRating;

  if (currentRating < 700)  return 1;  // Easy
  if (currentRating < 900)  return 2;  // Fair
  if (currentRating < 1150) return 3;  // Medium
  if (currentRating < 1450) return 4;  // Hard
  return 5;                            // Expert
}

// ══════════════════════════════════════════════════════════
// REPUTATION SCORE (CREATOR AGGREGATE)
// ══════════════════════════════════════════════════════════

/**
 * Weighted average of a creator's problem ratings.
 * Problems with at least one attempt are weighted 1×; untested problems 0.5×.
 *
 * @param {object}   opts
 * @param {object[]} opts.problems - Array of problem objects with { rating?, difficulty?, total_attempts }
 * @returns {number} Aggregated creator Elo score
 */
function computeCreatorScore({ problems }) {
  if (!problems || problems.length === 0) return BASE_RATING;

  let weightedSum = 0;
  let totalWeight = 0;

  for (const p of problems) {
    // BUG FIX: `p.rating` may be 0 (falsy) — use explicit null check instead.
    const rating = (p.rating != null && p.rating > 5)
      ? p.rating
      : (DIFFICULTY_TO_RATING[p.difficulty] ?? BASE_RATING);

    const weight = (p.total_attempts > 0) ? 1 : 0.5;

    weightedSum  += rating * weight;
    totalWeight  += weight;
  }

  return totalWeight > 0 ? Math.round(weightedSum / totalWeight) : BASE_RATING;
}

// ══════════════════════════════════════════════════════════
// ANTI-ABUSE
// ══════════════════════════════════════════════════════════

/**
 * Decides whether a problem should be auto-hidden based on abuse signals.
 *
 * @param {object} opts
 * @param {number} opts.reports        - Total report count
 * @param {number} opts.total_attempts - Total attempt count
 * @param {number} opts.upvotes        - Total upvote count
 * @returns {{ hide: boolean, reason?: string }}
 */
function shouldAutoHide({ reports = 0, total_attempts = 0, upvotes = 0 }) {
  if (reports >= 10) {
    return { hide: true, reason: 'absolute_report_threshold' };
  }
  if (reports >= 5 && reports > upvotes * 2) {
    return { hide: true, reason: 'high_report_ratio' };
  }
  // BUG FIX: `total_attempts` was accepted but never used. Added a guard:
  // if a brand-new problem (few attempts) is already accumulating reports fast,
  // surface it for review before it spreads.
  if (total_attempts > 0 && reports / total_attempts >= 0.4 && reports >= 3) {
    return { hide: true, reason: 'high_report_rate_early' };
  }
  return { hide: false };
}

// ══════════════════════════════════════════════════════════
// EXPORTS
// ══════════════════════════════════════════════════════════
module.exports = {
  BASE_RATING,
  FLOOR_RATING,
  K_FACTOR,
  DIFFICULTY_TO_RATING,
  calcSolverReward,
  calcCreatorReward,
  adjustDifficulty,
  computeCreatorScore,
  shouldAutoHide,
};