// math/mathEngine.js
// Handles parsing, normalization and equivalence checking for math expressions.
// Depends on: mathjs  →  npm install mathjs

const { create, all, parse, simplify, evaluate } = require('mathjs');

const math = create(all);

// ══════════════════════════════════════════════════════════
// EXPRESSION STORAGE FORMAT
//
// Every expression is stored as an ExpressionDoc:
// {
//   latex:      string,   — display string (LaTeX), e.g. "\\frac{1}{2}x^2"
//   canonical:  string,   — normalized mathjs string, e.g. "0.5 * x ^ 2"
//   variables:  string[], — variables detected, e.g. ["x"]
//   type:       string,   — "numeric" | "symbolic" | "equation"
// }
//
// LaTeX is for rendering in the frontend.
// canonical is what we actually compare.
// ══════════════════════════════════════════════════════════

// ── LaTeX → mathjs string ─────────────────────────────────
// Converts the subset of LaTeX the math keyboard produces
// into a string mathjs can parse.
function latexToMathjs(latex) {
  let s = latex.trim();

  // Fractions: \frac{a}{b} → (a)/(b)
  s = s.replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '($1)/($2)');

  // Square roots: \sqrt{x} → sqrt(x)
  s = s.replace(/\\sqrt\{([^}]+)\}/g, 'sqrt($1)');

  // Exponents: x^{n} → x^(n)
  s = s.replace(/\^\{([^}]+)\}/g, '^($1)');

  // Integrals: \int_{a}^{b} expr dx → integrate(expr, x, a, b)
  // (for definite integrals the keyboard emits a structured token)
  s = s.replace(
    /\\int_\{([^}]+)\}\^\{([^}]+)\}\s*(.+?)\s*d([a-z])/g,
    'integrate($3, $4, $1, $2)'
  );

  // Indefinite integrals: \int expr dx → integrate(expr, x)
  s = s.replace(/\\int\s*(.+?)\s*d([a-z])/g, 'integrate($1, $2)');

  // Derivatives: \frac{d}{dx}(expr) → derivative(expr, x)
  s = s.replace(/\\frac\{d\}\{d([a-z])\}\(([^)]+)\)/g, 'derivative($2, $1)');

  // d/dx expr → derivative(expr, x)
  s = s.replace(/d\/d([a-z])\s+(.+)/, 'derivative($2, $1)');

  // Clean remaining LaTeX commands
  s = s.replace(/\\cdot/g, '*');
  s = s.replace(/\\times/g, '*');
  s = s.replace(/\\div/g, '/');
  s = s.replace(/\\pi/g, 'pi');
  s = s.replace(/\\infty/g, 'Infinity');
  s = s.replace(/\\left|\\right/g, '');
  s = s.replace(/\{|\}/g, '');   // leftover braces

  return s.trim();
}

// ── Detect variables in an expression ─────────────────────
function detectVariables(mathjsStr) {
  const KNOWN_CONSTANTS = new Set(['pi', 'e', 'i', 'Infinity', 'sqrt', 'integrate', 'derivative', 'log', 'sin', 'cos', 'tan', 'abs']);
  const tokens = mathjsStr.match(/[a-zA-Z_][a-zA-Z0-9_]*/g) || [];
  return [...new Set(tokens.filter(t => !KNOWN_CONSTANTS.has(t)))];
}

// ── Normalize an expression to a canonical string ─────────
function normalize(mathjsStr) {
  try {
    const node = math.parse(mathjsStr);
    const simplified = math.simplify(node);
    return simplified.toString();
  } catch {
    // If simplify fails, return the raw string
    return mathjsStr;
  }
}

// ══════════════════════════════════════════════════════════
// PARSE & BUILD ExpressionDoc FROM LATEX
// ══════════════════════════════════════════════════════════
function buildExpressionDoc(latex) {
  const mathjsStr = latexToMathjs(latex);
  const canonical = normalize(mathjsStr);
  const variables = detectVariables(canonical);

  // Determine type
  let type = 'numeric';
  if (variables.length > 0) type = 'symbolic';
  if (latex.includes('=')) type = 'equation';

  return { latex, canonical, variables, type };
}

// ══════════════════════════════════════════════════════════
// EQUIVALENCE CHECKING
//
// Strategy (layered — stops at first match):
//   1. Canonical string equality (cheap)
//   2. Symbolic simplification of (A - B) == 0
//   3. Numerical evaluation at N random points
//
// Returns: { equal: bool, method: string, confidence: number }
// ══════════════════════════════════════════════════════════

const NUM_EVAL_POINTS = 8;  // how many random points to test numerically

function checkEquivalence(exprA, exprB) {
  const a = typeof exprA === 'string' ? exprA : exprA.canonical;
  const b = typeof exprB === 'string' ? exprB : exprB.canonical;

  // ── 1. Cheap string equality ──────────────────────────
  if (a === b) return { equal: true, method: 'canonical_string', confidence: 1.0 };

  // ── 2. Symbolic: simplify(A - B) == 0 ────────────────
  try {
    const diff   = math.parse(`(${a}) - (${b})`);
    const result = math.simplify(diff);
    if (result.toString() === '0') {
      return { equal: true, method: 'symbolic_simplify', confidence: 1.0 };
    }
  } catch { /* fall through */ }

  // ── 3. Numerical evaluation ───────────────────────────
  const vars = [...new Set([
    ...detectVariables(a),
    ...detectVariables(b),
  ])];

  if (vars.length === 0) {
    // Pure numeric — evaluate both
    try {
      const va = math.evaluate(a);
      const vb = math.evaluate(b);
      if (typeof va === 'number' && typeof vb === 'number') {
        const equal = Math.abs(va - vb) < 1e-9;
        return { equal, method: 'numeric_eval', confidence: equal ? 0.99 : 1.0 };
      }
    } catch { /* fall through */ }
  } else {
    // Symbolic — test at random points
    let matches = 0;
    let tested  = 0;

    for (let i = 0; i < NUM_EVAL_POINTS; i++) {
      const scope = {};
      vars.forEach(v => { scope[v] = Math.random() * 10 - 5; }); // range [-5, 5]

      try {
        const va = math.evaluate(a, scope);
        const vb = math.evaluate(b, scope);
        if (typeof va === 'number' && typeof vb === 'number' && isFinite(va) && isFinite(vb)) {
          tested++;
          if (Math.abs(va - vb) < 1e-6) matches++;
        }
      } catch { /* skip this point */ }
    }

    if (tested >= 4) {
      const confidence = matches / tested;
      return {
        equal:      confidence >= 0.95,
        method:     'numerical_sampling',
        confidence,
        points:     { tested, matches },
      };
    }
  }

  return { equal: false, method: 'failed_all_checks', confidence: 0 };
}

// ══════════════════════════════════════════════════════════
// VALIDATE a solver's answer against the stored correct answer
// ══════════════════════════════════════════════════════════
function validateAnswer(solverLatex, correctExprDoc) {
  try {
    const solverDoc = buildExpressionDoc(solverLatex);
    const result    = checkEquivalence(solverDoc, correctExprDoc);
    return {
      correct:    result.equal,
      method:     result.method,
      confidence: result.confidence,
      solverDoc,
    };
  } catch (err) {
    return {
      correct:    false,
      method:     'parse_error',
      confidence: 0,
      error:      err.message,
    };
  }
}

module.exports = { buildExpressionDoc, validateAnswer, checkEquivalence, latexToMathjs, normalize };