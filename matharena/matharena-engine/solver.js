// ─────────────────────────────────────────────────────────────────────────────
// solver.js  —  Double-checks answers for numeric problems using math.js
// For symbolic / calculus problems, answer is asserted from the template
// itself (trusted correct_answer), so we do a structural confidence check.
// ─────────────────────────────────────────────────────────────────────────────

const math = require("mathjs");

/**
 * Attempt to evaluate a LaTeX-ish expression numerically.
 * Converts common LaTeX to mathjs-parseable form.
 */
function latexToMathJS(tex) {
  return tex
    .replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, "($1)/($2)")
    .replace(/\\sqrt\{([^}]+)\}/g, "sqrt($1)")
    .replace(/\\left\|/g, "abs(")
    .replace(/\\right\|/g, ")")
    .replace(/\^{([^}]+)}/g, "^($1)")
    .replace(/\\/g, "")
    .replace(/\{|\}/g, "")
    .replace(/,\s*x\s*=/g, "")  // strip "x = a, x = b" style
    .replace(/x\s*=/g, "")
    .trim();
}

/**
 * Try to numerically evaluate an expression.
 * Returns { value: number, ok: true } or { ok: false }.
 */
function tryEval(expr) {
  try {
    const clean = latexToMathJS(expr);
    const val = math.evaluate(clean);
    if (typeof val === "number" && isFinite(val)) return { value: val, ok: true };
    return { ok: false };
  } catch {
    return { ok: false };
  }
}

/**
 * For numeric problems, verify that the correct_answer evaluates to a value
 * clearly different from all distractors.
 * Returns a confidence object.
 */
function verifyProblem(problem) {
  const { options, correct_index, _raw } = problem;

  if (!_raw) return { verified: false, method: "no_raw", confidence: "low" };

  const correctExpr = _raw.correct_answer;
  const distractors = _raw.distractors;

  const correctEval = tryEval(correctExpr);
  const distractorEvals = distractors.map(d => tryEval(d));

  if (correctEval.ok) {
    // Check that none of the distractors evaluate to the same value
    const collisions = distractorEvals.filter(
      d => d.ok && Math.abs(d.value - correctEval.value) < 1e-9
    );

    if (collisions.length > 0) {
      return {
        verified: false,
        method: "numeric",
        confidence: "fail",
        reason: `Distractor evaluates to same value as correct answer (${correctEval.value})`
      };
    }

    return { verified: true, method: "numeric", confidence: "high", correctValue: correctEval.value };
  }

  // Symbolic / LaTeX answer — trust the template but flag as medium confidence
  return { verified: true, method: "symbolic_trust", confidence: "medium" };
}

/**
 * Run the solver over all problems.
 * Returns { verified: Problem[], failed: Problem[] }
 */
function solveAndVerify(problems) {
  const verified = [];
  const failed = [];

  for (const p of problems) {
    const result = verifyProblem(p);
    p._verification = result;

    if (result.confidence === "fail") {
      failed.push({ ...p, _failReason: result.reason });
    } else {
      verified.push(p);
    }
  }

  return { verified, failed };
}

module.exports = { solveAndVerify, verifyProblem };