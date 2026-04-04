// challenges/challenges.js
// Main router for problems, solving, explore feed.
// Mount as: app.use('/challenges', challengesRouter);

const express      = require('express');
const { ObjectId } = require('mongodb');
const rateLimit    = require('express-rate-limit');
const router       = express.Router();

const { buildExpressionDoc, validateAnswer } = require('../math/mathEngine');
const {
  BASE_RATING,
  DIFFICULTY_TO_RATING,
  calcSolverReward,
  calcCreatorReward,
  adjustDifficulty,
  shouldAutoHide,
} = require('../math/scoring');

// ── requireAuth inline (reads JWT cookie already set by server.js) ──────────
const jwt = require('jsonwebtoken');
function requireAuth(req, res, next) {
  const token = req.cookies?.accessToken;
  if (!token) return res.status(401).json({ success: false, message: 'Not authenticated' });
  try {
    req.user = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
    next();
  } catch {
    res.status(401).json({ success: false, message: 'Token expired' });
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function getCollections(req) {
  const db = req.app.locals.db;
  return {
    problems: db.collection('problems'),
    attempts: db.collection('attempts'),
    users:    db.collection('users'),
    views:    db.collection('problem_views'),
  };
}

// ── Rate limiters ────────────────────────────────────────────────────────────
const createLimiter  = rateLimit({ windowMs: 60 * 60 * 1000, max: 10, message: { success: false, message: 'Max 10 problems per hour' } });
const attemptLimiter = rateLimit({ windowMs: 60 * 1000,      max: 20, message: { success: false, message: 'Too many attempts'        } });

// ══════════════════════════════════════════════════════════════════════════════
// DATABASE SCHEMA (reference — indexes created in server.js startServer)
//
// Collection: problems
// {
//   _id, creator_id, creator_name,
//   problem_text:   { latex, canonical, variables, type },  ← ExpressionDoc
//   correct_answer: { latex, canonical, variables, type },  ← ExpressionDoc
//   explanation:        string,         ← mandatory solution explanation
//   topic:              string,         ← "algebra"|"calculus"|"geometry"|"number_theory"|"statistics"|"other"
//   difficulty:         number,         ← 1–5 label (derived from rating, updated each attempt)
//   initial_difficulty: number,         ← user-set label, immutable
//   rating:             number,         ← live Elo rating (starts at DIFFICULTY_TO_RATING[difficulty])
//   tags:               string[],
//   upvotes:            number,  upvoted_by:  ObjectId[],
//   reports:            number,  reported_by: [{ userId, reason, createdAt }],
//   total_attempts:     number,
//   correct_attempts:   number,
//   success_rate:       number,         ← recomputed on each attempt
//   visible:            bool,
//   hide_reason:        string|null,
//   createdAt: Date, updatedAt: Date,
// }
//
// Collection: users
// {
//   ...,
//   solver_rating:  number,  ← live Elo (starts at BASE_RATING = 800)
//   solver_score:   number,  ← cumulative display score (sum of all Elo changes)
//   current_streak: number,
//   total_solves:   number,
// }
//
// Collection: attempts
// {
//   _id, problem_id, solver_id, solver_name,
//   answer:         { latex, canonical, variables, type },
//   explanation:    string|null,
//   correct:        bool,
//   validation:     { method, confidence },
//   elo_change:     number,             ← applied solver Elo delta (can be negative)
//   solver_rating_after: number,        ← solver's Elo after this attempt
//   createdAt: Date,
// }
//
// Collection: problem_views
// { _id, problem_id, user_id, createdAt }  ← unique compound index
//
// ══════════════════════════════════════════════════════════════════════════════

// ══════════════════════════════════════════
// POST /challenges/problems
// Create a new problem
// ══════════════════════════════════════════
router.post('/problems', requireAuth, createLimiter, async (req, res) => {
  const { problem_text_latex, answer_latex, explanation, topic, difficulty, tags } = req.body;
  const { problems, users } = getCollections(req);

  // ── Input validation ─────────────────────────────────────────────────────
  if (!problem_text_latex?.trim())
    return res.status(400).json({ success: false, message: 'Problem text is required' });
  if (!answer_latex?.trim())
    return res.status(400).json({ success: false, message: 'Correct answer is required — problems cannot be posted without one' });
  if (!explanation?.trim() || explanation.trim().length < 20)
    return res.status(400).json({ success: false, message: 'A solution explanation of at least 20 characters is required' });

  const VALID_TOPICS = ['algebra', 'calculus', 'geometry', 'number_theory', 'statistics', 'other'];
  if (!VALID_TOPICS.includes(topic))
    return res.status(400).json({ success: false, message: `Topic must be one of: ${VALID_TOPICS.join(', ')}` });

  const diff = Number(difficulty);
  if (!diff || diff < 1 || diff > 5)
    return res.status(400).json({ success: false, message: 'Difficulty must be 1–5' });

  // ── Creator reputation gate ───────────────────────────────────────────────
  const creator = await users.findOne({ _id: new ObjectId(req.user.userId) });
  if (!creator) return res.status(404).json({ success: false, message: 'User not found' });
  if ((creator.solver_rating ?? BASE_RATING) < 400)
    return res.status(403).json({ success: false, message: 'Your rating is too low to post problems — gain some points and try again' });

  // ── Parse expressions ─────────────────────────────────────────────────────
  let problemDoc, answerDoc;
  try {
    problemDoc = buildExpressionDoc(problem_text_latex);
    answerDoc  = buildExpressionDoc(answer_latex);
  } catch (err) {
    return res.status(400).json({ success: false, message: `Could not parse expression: ${err.message}` });
  }

  try {
    const now = new Date();

    // The problem starts with an Elo rating derived from the creator's chosen difficulty label.
    const initialRating = DIFFICULTY_TO_RATING[diff];

    const result = await problems.insertOne({
      creator_id:         new ObjectId(req.user.userId),
      creator_name:       creator.displayName ?? creator.username,
      problem_text:       problemDoc,
      correct_answer:     answerDoc,
      explanation:        explanation.trim(),
      topic,
      tags:               Array.isArray(tags) ? tags.slice(0, 5) : [],
      difficulty:         diff,           // 1–5 label (kept in sync with rating)
      initial_difficulty: diff,           // immutable
      rating:             initialRating,  // live Elo — this is the authoritative value
      upvotes:            0,
      upvoted_by:         [],
      reports:            0,
      reported_by:        [],
      total_attempts:     0,
      correct_attempts:   0,
      success_rate:       0,
      visible:            true,
      hide_reason:        null,
      createdAt:          now,
      updatedAt:          now,
    });

    res.status(201).json({ success: true, problem_id: result.insertedId });
  } catch (err) {
    console.error('POST /challenges/problems error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ══════════════════════════════════════════
// GET /challenges/explore
// Paginated feed — filtered and sorted
//
// Query params:
//   page       (default 1)
//   limit      (default 10, max 20)
//   topic      filter
//   difficulty filter 1–5
//   sort       "new" | "top" | "trending" (default "trending")
// ══════════════════════════════════════════
router.get('/explore', requireAuth, async (req, res) => {
  const { problems, attempts } = getCollections(req);

  const page       = Math.max(1, parseInt(req.query.page)  || 1);
  const limit      = Math.min(20, parseInt(req.query.limit) || 10);
  const skip       = (page - 1) * limit;
  const topic      = req.query.topic || null;
  const diffFilter = parseInt(req.query.difficulty) || null;
  const sort       = req.query.sort || 'trending';

  const filter = { visible: true };
  if (topic)      filter.topic      = topic;
  if (diffFilter) filter.difficulty = diffFilter;

  try {
    let docs;

    if (sort === 'trending') {
      const now = Date.now();
      docs = await problems.aggregate([
        { $match: filter },
        {
          $addFields: {
            trending_score: {
              // (upvotes × 3 + total_attempts) / (age_hours + 2)^1.2
              $divide: [
                { $add: [{ $multiply: ['$upvotes', 3] }, '$total_attempts'] },
                {
                  $pow: [
                    { $add: [{ $divide: [{ $subtract: [now, '$createdAt'] }, 3600000] }, 2] },
                    1.2,
                  ],
                },
              ],
            },
          },
        },
        { $sort: { trending_score: -1 } },
        { $skip: skip },
        { $limit: limit },
        { $project: { correct_answer: 0, reported_by: 0, upvoted_by: 0 } },
      ]).toArray();
    } else {
      const sortObj = sort === 'new'
        ? { createdAt: -1 }
        : { upvotes: -1, correct_attempts: -1 };  // "top"

      docs = await problems
        .find(filter, { projection: { correct_answer: 0, reported_by: 0, upvoted_by: 0 } })
        .sort(sortObj)
        .skip(skip)
        .limit(limit)
        .toArray();
    }

    // ── Mark which problems the current user has already attempted ────────
    const problemIds   = docs.map(d => d._id);
    const userAttempts = await attempts.find(
      { problem_id: { $in: problemIds }, solver_id: new ObjectId(req.user.userId) },
      { projection: { problem_id: 1, correct: 1 } }
    ).toArray();

    const attemptMap = {};
    userAttempts.forEach(a => { attemptMap[a.problem_id.toString()] = a.correct; });

    const enriched = docs.map(d => ({
      ...d,
      creator_id:     d.creator_id?.toString() ?? null,
      user_attempted: d._id.toString() in attemptMap,
      user_solved:    attemptMap[d._id.toString()] === true,
    }));

    const total = await problems.countDocuments(filter);
    res.json({
      success:    true,
      problems:   enriched,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error('GET /challenges/explore error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ══════════════════════════════════════════
// GET /challenges/problems/:id
// Single problem — answer never exposed
// ══════════════════════════════════════════
router.get('/problems/:id', requireAuth, async (req, res) => {
  const { problems, views } = getCollections(req);

  try {
    const problem = await problems.findOne(
      { _id: new ObjectId(req.params.id), visible: true },
      { projection: { correct_answer: 0, reported_by: 0, upvoted_by: 0 } }
    );
    if (!problem) return res.status(404).json({ success: false, message: 'Problem not found' });

    // ── Record unique view ────────────────────────────────────────────────
    const userId = new ObjectId(req.user.userId);
    await views.updateOne(
      { problem_id: problem._id, user_id: userId },
      { $setOnInsert: { problem_id: problem._id, user_id: userId, createdAt: new Date() } },
      { upsert: true }
    );

    const viewCount = await views.countDocuments({ problem_id: problem._id });
    res.json({ success: true, problem: { ...problem, view_count: viewCount } });
  } catch (err) {
    console.error('GET /challenges/problems/:id error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ══════════════════════════════════════════
// POST /challenges/problems/:id/attempt
// Submit an answer
// ══════════════════════════════════════════
router.post('/problems/:id/attempt', requireAuth, attemptLimiter, async (req, res) => {
  const { answer_latex, explanation } = req.body;
  const { problems, attempts, users } = getCollections(req);

  if (!answer_latex?.trim())
    return res.status(400).json({ success: false, message: 'Answer is required' });

  try {
    const problem = await problems.findOne({ _id: new ObjectId(req.params.id), visible: true });
    if (!problem) return res.status(404).json({ success: false, message: 'Problem not found' });

    const solverId = new ObjectId(req.user.userId);

    // ── Guard: creator cannot solve their own problem ─────────────────────
    if (problem.creator_id.toString() === solverId.toString())
      return res.status(403).json({ success: false, message: 'You cannot solve your own problem' });

    // ── Guard: already solved ─────────────────────────────────────────────
    const prevCorrect = await attempts.findOne({ problem_id: problem._id, solver_id: solverId, correct: true });
    if (prevCorrect)
      return res.status(409).json({ success: false, message: 'You already solved this problem' });

    // ── Validate answer ───────────────────────────────────────────────────
    const validation = validateAnswer(answer_latex, problem.correct_answer);

    // ── Fetch solver to get their current Elo rating ──────────────────────
    const solver       = await users.findOne({ _id: solverId });
    const solverRating = solver?.solver_rating ?? BASE_RATING;

    // ── ELO calculations ──────────────────────────────────────────────────
    //
    // Both sides need the problem's live Elo (`problem.rating`).
    // `calcSolverReward`  → returns the solver's new Elo + the applied change.
    // `calcCreatorReward` → returns the problem's new Elo + the applied change.
    //   The creator's personal score shifts by the same delta as their problem.

    const solverResult  = calcSolverReward({
      solverRating:  solverRating,
      problemRating: problem.rating,   // live Elo, not the 1–5 label
      result:        validation.correct ? 'win' : 'loss',
    });

    const creatorResult = calcCreatorReward({
      problemRating: problem.rating,
      solverRating:  solverRating,
      correct:       validation.correct,
    });

    // ── Derive the updated difficulty label from the problem's new Elo ────
    const newDifficultyLabel = adjustDifficulty({ currentRating: creatorResult.total });

    // ── Persist attempt ───────────────────────────────────────────────────
    const now = new Date();
    await attempts.insertOne({
      problem_id:          problem._id,
      solver_id:           solverId,
      solver_name:         solver?.displayName ?? solver?.username ?? 'Unknown',
      answer:              { latex: answer_latex },
      explanation:         explanation?.trim().length >= 10 ? explanation.trim() : null,
      correct:             validation.correct,
      validation:          { method: validation.method, confidence: validation.confidence },
      elo_change:          solverResult.change,   // signed delta actually applied
      solver_rating_after: solverResult.total,
      createdAt:           now,
    });

    // ── Update problem: Elo rating, difficulty label, attempt counters ────
    const newTotal   = problem.total_attempts + 1;
    const newCorrect = problem.correct_attempts + (validation.correct ? 1 : 0);

    await problems.updateOne(
      { _id: problem._id },
      {
        $inc: { total_attempts: 1, ...(validation.correct && { correct_attempts: 1 }) },
        $set: {
          rating:       creatorResult.total,      // updated Elo
          difficulty:   newDifficultyLabel,        // derived 1–5 label
          success_rate: newCorrect / newTotal,
          updatedAt:    now,
        },
      }
    );

    // ── Update solver: Elo rating + cumulative display score + streak ─────
    //
    // solver_rating = their authoritative Elo (written as an absolute value).
    // solver_score  = cumulative sum of all Elo changes (for leaderboards/display).
    const solverUpdate = {
      $set: { solver_rating: solverResult.total },
      $inc: { solver_score: solverResult.change },
    };
    if (validation.correct) {
      solverUpdate.$inc.current_streak = 1;
      solverUpdate.$inc.total_solves   = 1;
    } else {
      solverUpdate.$set.current_streak = 0;
    }
    await users.updateOne({ _id: solverId }, solverUpdate);

    // ── Update creator: shift their score by the same delta the problem took ─
    //
    // When a solver beats the problem, the problem (and creator) lose Elo.
    // When the solver fails, both gain Elo.  creatorResult.change is already signed.
    await users.updateOne(
      { _id: problem.creator_id },
      { $inc: { creator_score: creatorResult.change } }
    );

    res.json({
      success:         true,
      correct:         validation.correct,
      method:          validation.method,
      elo_change:      solverResult.change,         // e.g. +18 or -12
      new_rating:      solverResult.total,          // solver's Elo after this attempt
      new_difficulty:  newDifficultyLabel,          // updated 1–5 label for the problem
      // Only reveal the answer and explanation on a correct solve
      ...(validation.correct && {
        correct_answer: problem.correct_answer.latex,
        explanation:    problem.explanation,
      }),
    });

  } catch (err) {
    console.error('POST /challenges/problems/:id/attempt error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ══════════════════════════════════════════
// POST /challenges/problems/:id/upvote
// Toggle upvote on a problem
// ══════════════════════════════════════════
router.post('/problems/:id/upvote', requireAuth, async (req, res) => {
  const { problems } = getCollections(req);
  const userId = new ObjectId(req.user.userId);

  try {
    const problem = await problems.findOne({ _id: new ObjectId(req.params.id) });
    if (!problem) return res.status(404).json({ success: false, message: 'Problem not found' });

    const alreadyVoted = problem.upvoted_by.some(id => id.toString() === userId.toString());

    if (alreadyVoted) {
      await problems.updateOne(
        { _id: problem._id },
        { $inc: { upvotes: -1 }, $pull: { upvoted_by: userId } }
      );
      return res.json({ success: true, action: 'removed', upvotes: problem.upvotes - 1 });
    }

    await problems.updateOne(
      { _id: problem._id },
      { $inc: { upvotes: 1 }, $addToSet: { upvoted_by: userId } }
    );
    return res.json({ success: true, action: 'added', upvotes: problem.upvotes + 1 });
  } catch (err) {
    console.error('POST /challenges/problems/:id/upvote error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ══════════════════════════════════════════
// POST /challenges/problems/:id/report
// Report a problem
// ══════════════════════════════════════════
router.post('/problems/:id/report', requireAuth, async (req, res) => {
  const { reason } = req.body;
  const VALID_REASONS = ['spam', 'incorrect_answer', 'misleading', 'duplicate', 'inappropriate'];
  if (!VALID_REASONS.includes(reason))
    return res.status(400).json({ success: false, message: `Reason must be one of: ${VALID_REASONS.join(', ')}` });

  const { problems, users } = getCollections(req);
  const userId = new ObjectId(req.user.userId);

  try {
    const problem = await problems.findOne({ _id: new ObjectId(req.params.id) });
    if (!problem) return res.status(404).json({ success: false, message: 'Problem not found' });

    const alreadyReported = problem.reported_by.some(r => r.userId.toString() === userId.toString());
    if (alreadyReported)
      return res.status(409).json({ success: false, message: 'You already reported this problem' });

    const newReports = problem.reports + 1;
    await problems.updateOne(
      { _id: problem._id },
      {
        $inc:  { reports: 1 },
        $push: { reported_by: { userId, reason, createdAt: new Date() } },
      }
    );

    // ── Auto-hide check ───────────────────────────────────────────────────
    const hideCheck = shouldAutoHide({
      reports:        newReports,
      total_attempts: problem.total_attempts,
      upvotes:        problem.upvotes,
    });

    if (hideCheck.hide) {
      await problems.updateOne(
        { _id: problem._id },
        { $set: { visible: false, hide_reason: hideCheck.reason } }
      );

      // Penalise creator: drop their Elo by a fixed amount depending on violation type.
      // Using concrete Elo values rather than a deleted POINTS constant.
      const penalty = reason === 'incorrect_answer' ? 50 : 30;
      await users.updateOne(
        { _id: problem.creator_id },
        { $inc: { creator_score: -penalty } }
      );
    }

    res.json({ success: true, message: 'Report submitted' });
  } catch (err) {
    console.error('POST /challenges/problems/:id/report error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ══════════════════════════════════════════
// GET /challenges/problems/:id/attempts
// Leaderboard of correct solvers
// ══════════════════════════════════════════
router.get('/problems/:id/attempts', requireAuth, async (req, res) => {
  const { attempts } = getCollections(req);
  try {
    const docs = await attempts
      .find(
        { problem_id: new ObjectId(req.params.id), correct: true },
        { projection: { solver_name: 1, elo_change: 1, solver_rating_after: 1, createdAt: 1, explanation: 1 } }
      )
      .sort({ createdAt: 1 })   // first solvers first
      .limit(50)
      .toArray();

    res.json({ success: true, solvers: docs });
  } catch (err) {
    console.error('GET /challenges/problems/:id/attempts error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ══════════════════════════════════════════
// GET /challenges/problems/mine
// Creator's own problems
// ══════════════════════════════════════════
router.get('/problems/mine', requireAuth, async (req, res) => {
  const { problems } = getCollections(req);
  try {
    const docs = await problems
      .find(
        { creator_id: new ObjectId(req.user.userId) },
        { projection: { upvoted_by: 0, reported_by: 0 } }
      )
      .sort({ createdAt: -1 })
      .toArray();
    res.json({ success: true, problems: docs });
  } catch (err) {
    console.error('GET /challenges/problems/mine error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;