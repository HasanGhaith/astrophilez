// auth.js — Authentication routes, token helpers, and middleware
// Mounted by server.js. No DB connection logic lives here.

const crypto    = require('crypto');
const jwt       = require('jsonwebtoken');
const bcrypt    = require('bcrypt');
const rateLimit = require('express-rate-limit');
const express   = require('express');

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────
const ACCESS_MAX_AGE  = 60 * 60 * 1000;            // 1 hour
const REFRESH_MAX_AGE = 30 * 24 * 60 * 60 * 1000; // 30 days
const BCRYPT_ROUNDS   = 12;

// ─────────────────────────────────────────────
// Valid country codes
// ─────────────────────────────────────────────
const VALID_COUNTRY_CODES = new Set([
  'AF','AL','DZ','AD','AO','AG','AR','AM','AU','AT','AZ','BS','BH','BD','BB',
  'BY','BE','BZ','BJ','BT','BO','BA','BW','BR','BN','BG','BF','BI','CV','KH',
  'CM','CA','CF','TD','CL','CN','CO','KM','CG','CR','HR','CU','CY','CZ','DK',
  'DJ','DM','DO','EC','EG','SV','GQ','ER','EE','SZ','ET','FJ','FI','FR','GA',
  'GM','GE','DE','GH','GR','GD','GT','GN','GW','GY','HT','HN','HU','IS','IN',
  'ID','IR','IQ','IE','IL','IT','JM','JP','JO','KZ','KE','KI','KP','KR','KW',
  'KG','LA','LV','LB','LS','LR','LY','LI','LT','LU','MG','MW','MY','MV','ML',
  'MT','MH','MR','MU','MX','FM','MD','MC','MN','ME','MA','MZ','MM','NA','NR',
  'NP','NL','NZ','NI','NE','NG','MK','NO','OM','PK','PW','PA','PG','PY','PE',
  'PH','PL','PT','QA','RO','RU','RW','KN','LC','VC','WS','SM','ST','SA','SN',
  'RS','SC','SL','SG','SK','SI','SB','SO','ZA','SS','ES','LK','SD','SR','SE',
  'CH','SY','TW','TJ','TZ','TH','TL','TG','TO','TT','TN','TR','TM','TV','UG',
  'UA','AE','GB','US','UY','UZ','VU','VE','VN','YE','ZM','ZW',
]);

// ─────────────────────────────────────────────
// Token helpers
// ─────────────────────────────────────────────
function issueAccessToken(user) {
  return jwt.sign(
    {
      userId:      user._id.toString(),
      // FIX: was 'name' — renamed to 'displayName' to match the field name
      // used everywhere else in the app (challenges.js, profile APIs, shell.js).
      displayName: user.displayName ?? null,
      country:     user.country     ?? null,
    },
    process.env.JWT_ACCESS_SECRET,
   { expiresIn: '1h' }
  );
}

function issueRefreshToken() {
  return crypto.randomBytes(64).toString('hex');
}

function hashToken(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

function setAuthCookies(res, accessToken, refreshToken) {
  const secure = process.env.NODE_ENV === 'production';
  const base   = { httpOnly: true, secure, sameSite: 'lax' };
  res.cookie('accessToken',  accessToken,  { ...base, maxAge: ACCESS_MAX_AGE  });
  res.cookie('refreshToken', refreshToken, { ...base, maxAge: REFRESH_MAX_AGE });
}

function clearAuthCookies(res) {
  res.clearCookie('accessToken');
  res.clearCookie('refreshToken');
}

// ─────────────────────────────────────────────
// Auth middleware — use this in any route file
// ─────────────────────────────────────────────
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

// ─────────────────────────────────────────────
// Rate limiters
// ─────────────────────────────────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, message: 'Too many attempts, please try again later' },
});

// ══════════════════════════════════════════════════════════
// EMAIL VERIFICATION — uncomment once you have a domain on
// resend.com and set these env vars:
//   RESEND_API_KEY, APP_URL, EMAIL_FROM
// ══════════════════════════════════════════════════════════
// async function sendVerificationEmail(toEmail, verificationToken) {
//   const verifyUrl = `${process.env.APP_URL}/api/verify-email?token=${verificationToken}`;
//   const res = await fetch('https://api.resend.com/emails', {
//     method: 'POST',
//     headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
//     body: JSON.stringify({
//       from: process.env.EMAIL_FROM, to: [toEmail],
//       subject: 'Verify your Astrophiles account',
//       html: `<a href="${verifyUrl}">Verify My Account</a>`,
//     }),
//   });
//   if (!res.ok) { const err = await res.text(); throw new Error(`Resend error: ${err}`); }
// }

// ─────────────────────────────────────────────
// Router factory — call with usersCollection
// ─────────────────────────────────────────────
function createAuthRouter(usersCollection) {
  const router = express.Router();

  // ── REGISTER ───────────────────────────────
  router.post('/register', authLimiter, async (req, res) => {
    const { username, password, country } = req.body;

    if (!username || username.length < 2 || username.length > 20 || !/^[A-Za-z0-9_]+$/.test(username))
      return res.status(400).json({ success: false, message: 'Username must be 2–20 characters (letters, numbers, underscores only)' });
    if (!password || password.length < 6)
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });

    // FIX: normalise to uppercase before validation so 'lb' and 'LB' both work
    const normCountry = country?.toUpperCase();
    if (!normCountry || !VALID_COUNTRY_CODES.has(normCountry))
      return res.status(400).json({ success: false, message: 'Please select a valid country' });

    try {
      const existing = await usersCollection.findOne({ username: username.toLowerCase() });
      if (existing) return res.status(409).json({ success: false, message: 'Username already taken' });

      const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

      const inserted = await usersCollection.insertOne({
        username:      username.toLowerCase(),
        displayName:   username,          // preserves original casing for display
        passwordHash,
        country:       normCountry,       // always uppercase in DB e.g. 'LB'
        bio:           '',

        // ── Elo / scoring (new schema) ──────────────────────────
        solver_rating:  800,              // starting Elo (BASE_RATING from scoring.js)
        solver_score:   0,                // cumulative display score
        creator_score:  0,

        // ── Legacy points fields (kept for backwards compat) ────
        solver_points:  0,
        creator_points: 0,

        // ── Activity counters ────────────────────────────────────
        total_solves:   0,                // correct answers submitted as solver
        total_attempts: 0,                // total answer submissions (right + wrong)
        current_streak: 0,                // consecutive correct solves
        arena_seen: [],   // problem IDs seen in Math Arena

        // ── Social ──────────────────────────────────────────────
        followers:      [],               // array of user ObjectIds
        following:      [],               // array of user ObjectIds

        createdAt:      new Date(),
        updatedAt:      new Date(),
        refreshTokens:  [],
      });

      const user         = await usersCollection.findOne({ _id: inserted.insertedId });
      const accessToken  = issueAccessToken(user);
      const refreshToken = issueRefreshToken();

      await usersCollection.updateOne(
        { _id: user._id },
        {
          $push: {
            refreshTokens: {
              hash:      hashToken(refreshToken),
              expiresAt: new Date(Date.now() + REFRESH_MAX_AGE),
              createdAt: new Date(),
            },
          },
        }
      );

      setAuthCookies(res, accessToken, refreshToken);
      res.status(201).json({ success: true, message: 'Account created!' });
    } catch (err) {
      console.error('POST /api/register error:', err);
      res.status(500).json({ success: false, message: 'Server error, please try again' });
    }
  });

  // ── LOGIN ───────────────────────────────────
  router.post('/login', authLimiter, async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password)
      return res.status(400).json({ success: false, message: 'Username and password are required' });

    try {
      const user = await usersCollection.findOne({ username: username.toLowerCase() });
      if (!user || !user.passwordHash)
        return res.status(401).json({ success: false, message: 'Invalid username or password' });

      const valid = await bcrypt.compare(password, user.passwordHash);
      if (!valid)
        return res.status(401).json({ success: false, message: 'Invalid username or password' });

      const accessToken  = issueAccessToken(user);
      const refreshToken = issueRefreshToken();

      await usersCollection.updateOne(
        { _id: user._id },
        {
          $push: {
            refreshTokens: {
              hash:      hashToken(refreshToken),
              expiresAt: new Date(Date.now() + REFRESH_MAX_AGE),
              createdAt: new Date(),
            },
          },
        }
      );

      setAuthCookies(res, accessToken, refreshToken);
      res.json({ success: true, message: 'Logged in!' });
    } catch (err) {
      console.error('POST /api/login error:', err);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  });

  // ── REFRESH TOKEN ───────────────────────────
  router.post('/refresh', async (req, res) => {
    const raw = req.cookies?.refreshToken;
    if (!raw) return res.status(401).json({ success: false });

    const hash = hashToken(raw);
    const user = await usersCollection.findOne({
      refreshTokens: { $elemMatch: { hash, expiresAt: { $gt: new Date() } } },
    });

    if (!user) {
      clearAuthCookies(res);
      return res.status(401).json({ success: false });
    }

    const newRefreshToken = issueRefreshToken();
    const newAccessToken  = issueAccessToken(user);

    await usersCollection.updateOne(
      { _id: user._id },
      {
        $pull: { refreshTokens: { hash } },
        $push: {
          refreshTokens: {
            hash:      hashToken(newRefreshToken),
            expiresAt: new Date(Date.now() + REFRESH_MAX_AGE),
            createdAt: new Date(),
          },
        },
      }
    );

    setAuthCookies(res, newAccessToken, newRefreshToken);
    res.json({ success: true });
  });

  // ── LOGOUT ──────────────────────────────────
  router.post('/logout', async (req, res) => {
    const raw = req.cookies?.refreshToken;
    if (raw) {
      const hash = hashToken(raw);
      await usersCollection
        .updateOne({ 'refreshTokens.hash': hash }, { $pull: { refreshTokens: { hash } } })
        .catch(() => {});
    }
    clearAuthCookies(res);
    res.json({ success: true });
  });

  return router;
}

module.exports = {
  createAuthRouter,
  requireAuth,
  authLimiter,
  VALID_COUNTRY_CODES,
  issueAccessToken,
  issueRefreshToken,
  hashToken,
  setAuthCookies,
  clearAuthCookies,
  REFRESH_MAX_AGE,
};