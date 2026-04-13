// server.js — DB connection, API routes, app bootstrap
// Auth logic lives in auth.js. Add new features as separate route files.

require('dotenv').config();
const express    = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const cookieParser = require('cookie-parser');
const rateLimit  = require('express-rate-limit');
const path       = require('path');

const {
  createAuthRouter,
  requireAuth,
  authLimiter,
  VALID_COUNTRY_CODES,
} = require('./auth');

const app  = express();
const port = process.env.PORT || 5000;

app.set('trust proxy', 1);

// ─────────────────────────────────────────────
// Global middleware
// ─────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ─────────────────────────────────────────────
// Start server
// ─────────────────────────────────────────────
async function startServer() {
  try {
    const client = new MongoClient(process.env.MONGO_URI);
    await client.connect();
    console.log('Connected to MongoDB');

    const db              = client.db(process.env.MONGO_DB || 'astrophiles_auth');
    const usersCollection = db.collection('users');

    // Share DB with routers via app.locals
    app.locals.db                 = db;
    app.locals.usersCollection    = usersCollection;
    app.locals.problemsCollection = db.collection('problems');

    // DB indexes
    await usersCollection.createIndex({ username: 1 }, { unique: true, sparse: true });
    await usersCollection.createIndex({ 'refreshTokens.hash': 1 });
    await usersCollection.createIndex({ displayName: 1 });   // ← NEW: for by-name lookups

    // ── Mount auth routes (/api/register, /api/login, /api/logout, /auth/refresh)
    app.use('/api',   createAuthRouter(usersCollection));
    app.use('/auth',  createAuthRouter(usersCollection));   // keeps /auth/refresh working

    // ── Mount challenges router
    const challengesRouter = require('./challenges/challenges');
    app.use('/challenges', challengesRouter);

    // ══════════════════════════════════════════
    // API ROUTES
    // Add new feature routes below — each should
    // ideally live in its own file under /routes/
    // ══════════════════════════════════════════

    // ── GET CURRENT USER (from JWT) ──────────
    app.get('/api/me', requireAuth, (req, res) => {
      res.json({
        success: true,
        userId:  req.user.userId,
        name:    req.user.name,
        country: req.user.country ?? null,
      });
    });

    // ── CHECK USERNAME AVAILABILITY ──────────
    app.get('/api/check-username', async (req, res) => {
      const { username } = req.query;
      if (!username || username.length < 2 || username.length > 20 || !/^[A-Za-z0-9_]+$/.test(username))
        return res.json({ available: false });
      try {
        const existing = await usersCollection.findOne({ username: username.toLowerCase() });
        res.json({ available: !existing });
      } catch (err) {
        console.error('GET /api/check-username error:', err);
        res.status(500).json({ available: false });
      }
    });

    // ── LEADERBOARD ──────────────────────────
    app.get('/api/leaderboard', requireAuth, async (req, res) => {
  try {
    const users = await usersCollection
      .find({}, {
        projection: {
          displayName:   1,
          username:      1,
          solver_rating: 1,
          country:       1,
        }
      })
      .sort({ solver_rating: -1 })
      .toArray();

    const sanitized = users.map(u => ({
      _id:           u._id.toString(),
      name:          u.displayName ?? u.username ?? 'Anonymous',
      username:      u.username ?? '',
      solver_rating: u.solver_rating ?? 800,
      country:       u.country ?? null,
    }));

    res.json({ success: true, users: sanitized });
  } catch (err) {
    console.error('GET /api/leaderboard error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});
    // ── MAP DATA ─────────────────────────────
    app.get('/api/map', requireAuth, async (req, res) => {
      try {
        const users = await usersCollection
          .find(
            { country: { $exists: true, $ne: null } },
            { projection: { displayName: 1, solver_points: 1, creator_points: 1, country: 1, _id: 0 } }
          )
          .toArray();

        const byCountry = {};
        users.forEach(u => {
          if (!byCountry[u.country]) byCountry[u.country] = { count: 0, users: [] };
          byCountry[u.country].count++;
          byCountry[u.country].users.push({
            name:   u.displayName ?? 'Anonymous',
            points: (u.solver_points ?? 0) + (u.creator_points ?? 0),
          });
        });

        res.json({ success: true, byCountry });
      } catch (err) {
        console.error('GET /api/map error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
      }
    });

    // ── GET OWN PROFILE ──────────────────────
    app.get('/api/profile/me', requireAuth, async (req, res) => {
      try {
        const user = await usersCollection.findOne(
          { _id: new ObjectId(req.user.userId) },
          { projection: { passwordHash: 0, refreshTokens: 0, verificationToken: 0, verificationExpires: 0 } }
        );
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });
        res.json({
          success: true,
          user: {
            ...user,
            _id:       user._id.toString(),
            // Return counts for display, not the raw arrays
            followers: (user.followers || []).length,
            following: (user.following || []).length,
          },
        });
      } catch (err) {
        console.error('GET /api/profile/me error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
      }
    });

    // ── UPDATE BIO ───────────────────────────
    const bioLimiter = rateLimit({
      windowMs: 60 * 1000, max: 5,
      message: { success: false, message: 'Slow down — too many bio updates' },
    });

    app.post('/api/profile/bio', requireAuth, bioLimiter, async (req, res) => {
      const { bio } = req.body;
      if (typeof bio !== 'string')
        return res.status(400).json({ success: false, message: 'Invalid bio' });
      const trimmed = bio.trim();
      if (trimmed.length > 100)
        return res.status(400).json({ success: false, message: 'Bio must be 100 characters or less' });
      try {
        await usersCollection.updateOne(
          { _id: new ObjectId(req.user.userId) },
          { $set: { bio: trimmed } }
        );
        res.json({ success: true, message: 'Bio updated!' });
      } catch (err) {
        console.error('POST /api/profile/bio error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
      }
    });

    // ── UPDATE USERNAME (once per week) ──────
    app.post('/api/profile/username', requireAuth, authLimiter, async (req, res) => {
      const { username } = req.body;
      if (!username || username.length < 2 || username.length > 20 || !/^[A-Za-z0-9_]+$/.test(username))
        return res.status(400).json({ success: false, message: 'Username must be 2–20 characters (letters, numbers, underscores only)' });

      try {
        const user = await usersCollection.findOne({ _id: new ObjectId(req.user.userId) });
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });

        const ONE_WEEK = 7 * 24 * 60 * 60 * 1000;
        if (user.lastUsernameChange && (Date.now() - new Date(user.lastUsernameChange).getTime()) < ONE_WEEK) {
          const nextChange = new Date(new Date(user.lastUsernameChange).getTime() + ONE_WEEK);
          return res.status(429).json({
            success: false,
            message: `You can change your username again on ${nextChange.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`,
            nextChange: nextChange.toISOString(),
          });
        }

        const taken = await usersCollection.findOne({
          username: username.toLowerCase(),
          _id: { $ne: new ObjectId(req.user.userId) },
        });
        if (taken) return res.status(409).json({ success: false, message: 'Username already taken' });

        await usersCollection.updateOne(
          { _id: new ObjectId(req.user.userId) },
          { $set: { username: username.toLowerCase(), displayName: username, lastUsernameChange: new Date() } }
        );
        res.json({ success: true, message: 'Username updated!', displayName: username });
      } catch (err) {
        console.error('POST /api/profile/username error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
      }
    });

    // ── UPDATE COUNTRY ───────────────────────
    app.post('/api/profile/country', requireAuth, async (req, res) => {
      const { country } = req.body;
      if (!country || !VALID_COUNTRY_CODES.has(country.toUpperCase()))
        return res.status(400).json({ success: false, message: 'Invalid country' });
      try {
        await usersCollection.updateOne(
          { _id: new ObjectId(req.user.userId) },
          { $set: { country: country.toUpperCase() } }
        );
        res.json({ success: true, message: 'Country updated!' });
      } catch (err) {
        console.error('POST /api/profile/country error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
      }
    });

    // ── LOOK UP USER BY DISPLAY NAME ─────────
    // Must be registered BEFORE /api/users/:userId so Express doesn't
    // try to cast "by-name" as a MongoDB ObjectId.
    app.get('/api/users/by-name/:displayName', requireAuth, async (req, res) => {
      try {
        const name = req.params.displayName.trim();
        if (!name) return res.status(400).json({ success: false, message: 'Name required' });

        // Escape any regex special characters in the name, then do a
        // case-insensitive exact match against the displayName field.
        const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const user = await usersCollection.findOne(
          { displayName: { $regex: `^${escaped}$`, $options: 'i' } },
          { projection: { passwordHash: 0, refreshTokens: 0, verificationToken: 0, verificationExpires: 0, email: 0 } }
        );

        if (!user) return res.status(404).json({ success: false, message: 'User not found' });

        const isFollowing = (user.followers || []).some(
          id => id?.toString() === req.user.userId
        );

        res.json({
          success: true,
          user: {
            ...user,
            _id:       user._id.toString(),
            followers: (user.followers || []).map(id => id.toString()),
            following: (user.following || []).map(id => id.toString()),
          },
          isFollowing,
        });
      } catch (err) {
        console.error('GET /api/users/by-name/:displayName error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
      }
    });

    // ── GET USER PROBLEMS (POSTS) ─────────────
    app.get('/api/users/:userId/problems', requireAuth, async (req, res) => {
      try {
        const { userId } = req.params;

        // CRITICAL FIX: We must convert the string userId to an ObjectId
        // because the database stores it as an ObjectId.
        const problems = await db.collection('problems')
          .find(
            { creator_id: new ObjectId(userId) }, 
            { projection: { correct_answer: 0, reported_by: 0, upvoted_by: 0 } }
          )
          .sort({ createdAt: -1 }) // Show newest first
          .limit(50)               // Limit to 50 posts
          .toArray();

        res.json({ success: true, problems });
      } catch (err) {
        console.error('GET /api/users/:userId/problems error:', err);
        res.status(500).json({ success: false, message: 'Failed to load problems' });
      }
    });

    // ── GET PUBLIC USER PROFILE BY ID ────────
    app.get('/api/users/:userId', requireAuth, async (req, res) => {
      try {
        const user = await usersCollection.findOne(
          { _id: new ObjectId(req.params.userId) },
          { projection: { passwordHash: 0, refreshTokens: 0, verificationToken: 0, verificationExpires: 0, email: 0 } }
        );
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });

        const isFollowing = (user.followers || []).some(
          id => id?.toString() === req.user.userId || id?.$oid === req.user.userId
        );

        res.json({
          success: true,
          user: {
            ...user,
            _id:       user._id.toString(),
            followers: (user.followers || []).map(id => id.toString()),
            following: (user.following || []).map(id => id.toString()),
          },
          isFollowing,
        });
      } catch (err) {
        console.error('GET /api/users/:userId error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
      }
    });

    // ── FOLLOW / UNFOLLOW ────────────────────
    app.post('/api/users/:userId/follow', requireAuth, async (req, res) => {
      const targetId = req.params.userId;
      const myId     = req.user.userId;

      if (targetId === myId)
        return res.status(400).json({ success: false, message: "You can't follow yourself" });

      try {
        const target = await usersCollection.findOne({ _id: new ObjectId(targetId) });
        if (!target) return res.status(404).json({ success: false, message: 'User not found' });

        const alreadyFollowing = (target.followers || []).some(id => id.toString() === myId);

        if (alreadyFollowing) {
          await usersCollection.updateOne({ _id: new ObjectId(targetId) }, { $pull: { followers: new ObjectId(myId) } });
          await usersCollection.updateOne({ _id: new ObjectId(myId) },     { $pull: { following: new ObjectId(targetId) } });
        } else {
          await usersCollection.updateOne({ _id: new ObjectId(targetId) }, { $addToSet: { followers: new ObjectId(myId) } });
          await usersCollection.updateOne({ _id: new ObjectId(myId) },     { $addToSet: { following: new ObjectId(targetId) } });
        }

        const updated = await usersCollection.findOne({ _id: new ObjectId(targetId) });
        res.json({
          success:   true,
          action:    alreadyFollowing ? 'unfollowed' : 'followed',
          followers: (updated.followers || []).length,
        });
      } catch (err) {
        console.error('POST /api/users/:userId/follow error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
      }
    });

    // ── FRIENDS FEED ─────────────────────────
    app.get('/api/explore/friends', requireAuth, async (req, res) => {
      const page  = Math.max(1, parseInt(req.query.page)  || 1);
      const limit = Math.min(20, parseInt(req.query.limit) || 10);
      const skip  = (page - 1) * limit;

      try {
        const me = await usersCollection.findOne(
          { _id: new ObjectId(req.user.userId) },
          { projection: { following: 1 } }
        );

        const followingIds = me?.following || [];
        if (!followingIds.length) {
          return res.json({ success: true, problems: [], pagination: { page, limit, total: 0, pages: 0 }, empty: true });
        }

        const problems = db.collection('problems');
        const attempts = db.collection('attempts');

        const filter = { visible: true, creator_id: { $in: followingIds } };
        const total  = await problems.countDocuments(filter);
        const docs   = await problems
          .find(filter, { projection: { correct_answer: 0, reported_by: 0, upvoted_by: 0 } })
          .sort({ createdAt: -1 })
          .skip(skip).limit(limit)
          .toArray();

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

        res.json({ success: true, problems: enriched, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
      } catch (err) {
        console.error('GET /api/explore/friends error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
      }
    });

    // ── ADMIN: list all users ────────────────────
// Only hasan_ghaith_ and greg can access this
const ADMIN_USERNAMES = ['hasan_ghaith_', 'greg'];

app.get('/api/admin/users', requireAuth, async (req, res) => {
  try {
    const me = await usersCollection.findOne({ _id: new ObjectId(req.user.userId) });
    if (!me || !ADMIN_USERNAMES.includes(me.username))
      return res.status(403).json({ success: false, message: 'Forbidden' });

    const users = await usersCollection
      .find({}, {
        projection: {
          passwordHash: 0, refreshTokens: 0,
          verificationToken: 0, verificationExpires: 0,
        }
      })
      .sort({ createdAt: -1 })
      .toArray();

    const sanitized = users.map(u => ({
      ...u,
      _id:       u._id.toString(),
      followers: (u.followers || []).length,
      following: (u.following || []).length,
    }));

    res.json({ success: true, users: sanitized });
  } catch (err) {
    console.error('GET /api/admin/users error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ── ADMIN: delete a user account ─────────────
app.delete('/api/admin/users/:userId', requireAuth, async (req, res) => {
  try {
    const me = await usersCollection.findOne({ _id: new ObjectId(req.user.userId) });
    if (!me || !ADMIN_USERNAMES.includes(me.username))
      return res.status(403).json({ success: false, message: 'Forbidden' });

    const target = await usersCollection.findOne({ _id: new ObjectId(req.params.userId) });
    if (!target)
      return res.status(404).json({ success: false, message: 'User not found' });

    // Prevent deleting other admins
    if (ADMIN_USERNAMES.includes(target.username))
      return res.status(400).json({ success: false, message: 'Cannot delete an admin account' });

    await usersCollection.deleteOne({ _id: new ObjectId(req.params.userId) });

    // Also delete their problems
    await db.collection('problems').deleteMany({ creator_id: new ObjectId(req.params.userId) });

    res.json({ success: true, message: 'User and their problems deleted' });
  } catch (err) {
    console.error('DELETE /api/admin/users/:userId error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ── ADMIN: list all problems ──────────────────
app.get('/api/admin/problems', requireAuth, async (req, res) => {
  try {
    const me = await usersCollection.findOne({ _id: new ObjectId(req.user.userId) });
    if (!me || !ADMIN_USERNAMES.includes(me.username))
      return res.status(403).json({ success: false, message: 'Forbidden' });

    const problems = await db.collection('problems')
      .find({}, { projection: { correct_answer: 0, reported_by: 0, upvoted_by: 0 } })
      .sort({ createdAt: -1 })
      .toArray();

    const sanitized = problems.map(p => ({
      ...p,
      _id:        p._id.toString(),
      creator_id: p.creator_id?.toString() ?? null,
    }));

    res.json({ success: true, problems: sanitized });
  } catch (err) {
    console.error('GET /api/admin/problems error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ── ADMIN: delete a problem ───────────────────
app.delete('/api/admin/problems/:problemId', requireAuth, async (req, res) => {
  try {
    const me = await usersCollection.findOne({ _id: new ObjectId(req.user.userId) });
    if (!me || !ADMIN_USERNAMES.includes(me.username))
      return res.status(403).json({ success: false, message: 'Forbidden' });

    const result = await db.collection('problems')
      .deleteOne({ _id: new ObjectId(req.params.problemId) });

    if (result.deletedCount === 0)
      return res.status(404).json({ success: false, message: 'Problem not found' });

    // Also clean up any attempts on this problem
    await db.collection('attempts').deleteMany({ problem_id: new ObjectId(req.params.problemId) });

    res.json({ success: true, message: 'Problem deleted' });
  } catch (err) {
    console.error('DELETE /api/admin/problems/:problemId error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

    // ─────────────────────────────────────────
    // Static files (must come AFTER all API routes)
    // ─────────────────────────────────────────
    app.use(express.static(path.join(__dirname, 'public')));

    // ─────────────────────────────────────────
    // Frontend page routes
    // ─────────────────────────────────────────
    const page = (file) => (_req, res) => res.sendFile(path.join(__dirname, 'public', file));
    app.get('/',               page('index.html'));
    app.get('/auth',           page('auth.html'));
    app.get('/dashboard',      page('dashboard.html'));
    app.get('/profile',        page('profile.html'));
    app.get('/explore',        page('explore.html'));
    app.get('/create',         page('create.html'));
    app.get('/problem',        page('problem.html'));
    app.get('/user-profile',   page('user-profile.html'));   // ← NEW: public user profiles

    // ─────────────────────────────────────────
    // Local dev server
    // ─────────────────────────────────────────
    if (process.env.NODE_ENV !== 'production') {
      app.listen(port, () => console.log(`Server running at http://localhost:${port}`));
    }

    return app;

  } catch (e) {
    console.error('Failed to start server:', e);
    if (process.env.NODE_ENV !== 'production') process.exit(1);
    throw e;
  }
}

// ─────────────────────────────────────────────
// Boot — Promise is module-level so Vercel reuses
// the DB connection across invocations
// ─────────────────────────────────────────────
const appReady = startServer();

// Vercel serverless handler
module.exports = async (req, res) => {
  const resolvedApp = await appReady;
  resolvedApp(req, res);
};

module.exports.appReady = appReady;