// ─────────────────────────────────────────────────────────────────────────────
// templates.js  —  Math Arena problem templates
//
// Each template is a function that returns a raw problem object:
//   { question, correct_answer, distractors, difficulty, topic, explanation }
//
// question / correct_answer / distractors use LaTeX strings.
// distractors must have exactly 3 items (wrong answers).
// The pipeline will shuffle + insert correct_answer to build final options[].
// ─────────────────────────────────────────────────────────────────────────────

const math = require("mathjs");

// ── helpers ──────────────────────────────────────────────────────────────────

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randNonZeroInt(min, max) {
  let v;
  do { v = randInt(min, max); } while (v === 0);
  return v;
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function gcd(a, b) {
  a = Math.abs(a); b = Math.abs(b);
  while (b) { [a, b] = [b, a % b]; }
  return a;
}

function reduceFraction(n, d) {
  const g = gcd(Math.abs(n), Math.abs(d));
  const sn = d < 0 ? -n / g : n / g;
  const sd = Math.abs(d / g);
  return [sn, sd];
}

function fracTex(n, d) {
  const [rn, rd] = reduceFraction(n, d);
  if (rd === 1) return `${rn}`;
  return rn < 0
    ? `-\\frac{${Math.abs(rn)}}{${rd}}`
    : `\\frac{${rn}}{${rd}}`;
}

// Shuffle array in place and return it
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ── EASY TEMPLATES ────────────────────────────────────────────────────────────

function tpl_linear_equation() {
  // ax + b = c  →  x = (c-b)/a
  const a = randNonZeroInt(-9, 9);
  const x = randInt(-10, 10);
  const b = randInt(-20, 20);
  const c = a * x + b;

  const ans = fracTex(c - b, a);
  const wrong1 = fracTex(c - b, a + 1 || a + 2);
  const wrong2 = fracTex(c + b, a);
  const wrong3 = fracTex(b - c, a);

  return {
    question: `${a}x ${b >= 0 ? "+" : "-"} ${Math.abs(b)} = ${c}`,
    correct_answer: `x = ${ans}`,
    distractors: [`x = ${wrong1}`, `x = ${wrong2}`, `x = ${wrong3}`],
    difficulty: "easy",
    topic: "Algebra",
    explanation: `Subtract ${b} from both sides: ${a}x = ${c - b}. Divide by ${a}: x = ${ans}.`
  };
}

function tpl_quadratic_roots() {
  // (x - r)(x - s) = 0  →  x² - (r+s)x + rs = 0
  const r = randInt(-8, 8);
  let s;
  do { s = randInt(-8, 8); } while (s === r);

  const b = -(r + s);
  const c = r * s;
  const bStr = b === 0 ? "" : (b > 0 ? ` + ${b}x` : ` - ${Math.abs(b)}x`);
  const cStr = c === 0 ? "" : (c > 0 ? ` + ${c}` : ` - ${Math.abs(c)}`);

  return {
    question: `x^2${bStr}${cStr} = 0`,
    correct_answer: `x = ${r},\\; x = ${s}`,
    distractors: [
      `x = ${r + 1},\\; x = ${s}`,
      `x = ${-r},\\; x = ${-s}`,
      `x = ${r},\\; x = ${s + 1}`
    ],
    difficulty: "easy",
    topic: "Algebra",
    explanation: `Factor: (x ${r >= 0 ? "-" : "+"} ${Math.abs(r)})(x ${s >= 0 ? "-" : "+"} ${Math.abs(s)}) = 0.`
  };
}

function tpl_slope_of_line() {
  // Two points (x1,y1) (x2,y2)
  const x1 = randInt(-5, 5);
  const y1 = randInt(-5, 5);
  const dx = randNonZeroInt(-6, 6);
  const dy = randInt(-6, 6);
  const x2 = x1 + dx;
  const y2 = y1 + dy;

  const ans = fracTex(dy, dx);
  return {
    question: `\\text{Slope of the line through } (${x1}, ${y1}) \\text{ and } (${x2}, ${y2})`,
    correct_answer: ans,
    distractors: [
      fracTex(dx, dy || 1),
      fracTex(dy + 1, dx),
      fracTex(-dy, dx)
    ],
    difficulty: "easy",
    topic: "Algebra",
    explanation: `m = \\frac{y_2-y_1}{x_2-x_1} = \\frac{${dy}}{${dx}} = ${ans}`
  };
}

function tpl_basic_derivative() {
  // d/dx [ax^n]  →  nax^{n-1}
  const n = randInt(2, 7);
  const a = randNonZeroInt(-6, 6);
  const coeff = a * n;
  const exp = n - 1;

  const ansStr = exp === 1 ? `${coeff}x` : exp === 0 ? `${coeff}` : `${coeff}x^{${exp}}`;
  return {
    question: `\\frac{d}{dx}\\left[${a === 1 ? "" : a === -1 ? "-" : a}x^{${n}}\\right]`,
    correct_answer: ansStr,
    distractors: [
      exp === 1 ? `${coeff + 1}x` : `${coeff + 1}x^{${exp}}`,
      exp === 1 ? `${a}x` : `${a}x^{${exp}}`,
      `${coeff}x^{${n}}`
    ],
    difficulty: "easy",
    topic: "Derivatives",
    explanation: `Power rule: d/dx[ax^n] = nax^{n-1} = ${coeff}x^{${exp}}`
  };
}

function tpl_simple_integral() {
  // ∫ ax^n dx = a/(n+1) x^{n+1} + C
  const n = randInt(1, 5);
  const a = randNonZeroInt(-5, 5);
  const num = a;
  const den = n + 1;
  const expOut = n + 1;

  const coeffTex = fracTex(num, den);
  const ansTex = expOut === 1
    ? `${coeffTex}x + C`
    : `${coeffTex}x^{${expOut}} + C`;

  const d1 = expOut === 1
    ? `${fracTex(num, den + 1)}x^{2} + C`
    : `${fracTex(num, den + 1)}x^{${expOut + 1}} + C`;
  const d2 = expOut === 1
    ? `${a}x^{2} + C`
    : `${a}x^{${expOut}} + C`;
  const d3 = expOut === 1
    ? `${fracTex(num, den)}x^{${n}} + C`
    : `${fracTex(num, den)}x^{${n}} + C`;

  const opts = [d1, d2, d3];
  const unique = [...new Set(opts.filter(d => d !== ansTex))];
  while (unique.length < 3) unique.push(`${a + 1}x^{${expOut}} + C`);

  return {
    question: `\\int ${a === 1 ? "" : a === -1 ? "-" : a}x^{${n}}\\,dx`,
    correct_answer: ansTex,
    distractors: unique.slice(0, 3),
    difficulty: "easy",
    topic: "Integrals",
    explanation: `Power rule: \\int ax^n dx = \\frac{a}{n+1}x^{n+1} + C`
  };
}

function tpl_trig_value() {
  const angles = [
    { deg: 0,   rad: "0",           sin: "0",                cos: "1",                tan: "0" },
    { deg: 30,  rad: "\\pi/6",      sin: "\\frac{1}{2}",     cos: "\\frac{\\sqrt{3}}{2}", tan: "\\frac{1}{\\sqrt{3}}" },
    { deg: 45,  rad: "\\pi/4",      sin: "\\frac{\\sqrt{2}}{2}", cos: "\\frac{\\sqrt{2}}{2}", tan: "1" },
    { deg: 60,  rad: "\\pi/3",      sin: "\\frac{\\sqrt{3}}{2}", cos: "\\frac{1}{2}",     tan: "\\sqrt{3}" },
    { deg: 90,  rad: "\\pi/2",      sin: "1",                cos: "0",                tan: "\\text{undefined}" },
    { deg: 120, rad: "2\\pi/3",     sin: "\\frac{\\sqrt{3}}{2}", cos: "-\\frac{1}{2}",    tan: "-\\sqrt{3}" },
    { deg: 135, rad: "3\\pi/4",     sin: "\\frac{\\sqrt{2}}{2}", cos: "-\\frac{\\sqrt{2}}{2}", tan: "-1" },
    { deg: 150, rad: "5\\pi/6",     sin: "\\frac{1}{2}",     cos: "-\\frac{\\sqrt{3}}{2}", tan: "-\\frac{1}{\\sqrt{3}}" },
    { deg: 180, rad: "\\pi",        sin: "0",                cos: "-1",               tan: "0" },
  ];
  const a = pick(angles);
  const fns = ["sin", "cos", "tan"].filter(f => !(f === "tan" && a.deg === 90));
  const fn = pick(fns);
  const correct = a[fn];
  const wrong = angles
    .filter(x => x !== a)
    .map(x => x[fn])
    .filter(v => v !== correct);
  const shuffledWrong = shuffle([...new Set(wrong)]).slice(0, 3);
  while (shuffledWrong.length < 3) shuffledWrong.push(`${randInt(-2,2)}`);

  return {
    question: `\\${fn}\\!\\left(${a.rad}\\right)`,
    correct_answer: correct,
    distractors: shuffledWrong,
    difficulty: "easy",
    topic: "Trigonometry",
    explanation: `${fn}(${a.rad}) = ${correct}`
  };
}

// ── MEDIUM TEMPLATES ──────────────────────────────────────────────────────────

function tpl_chain_rule() {
  const fns = [
    {
      gen: () => {
        const a = randNonZeroInt(-5, 5);
        const n = randInt(2, 4);
        const coeff = a * n;
        const expInner = n - 1;
        return {
          question: `\\frac{d}{dx}\\left[\\sin(${a}x^{${n}})\\right]`,
          correct_answer: `${coeff}x^{${expInner}}\\cos(${a}x^{${n}})`,
          distractors: [
            `${coeff}x^{${expInner}}\\sin(${a}x^{${n}})`,
            `\\cos(${a}x^{${n}})`,
            `${a}x^{${n}}\\cos(${a}x^{${n}})`
          ]
        };
      }
    },
    {
      gen: () => {
        const a = randNonZeroInt(-5, 5);
        return {
          question: `\\frac{d}{dx}\\left[e^{${a}x}\\right]`,
          correct_answer: `${a}e^{${a}x}`,
          distractors: [
            `e^{${a}x}`,
            `${a}xe^{${a - 1}x}`,
            `${a + 1}e^{${a}x}`
          ]
        };
      }
    },
    {
      gen: () => {
        const a = randNonZeroInt(-4, 4);
        const b = randNonZeroInt(-4, 4);
        return {
          question: `\\frac{d}{dx}\\left[(${a}x + ${b})^3\\right]`,
          correct_answer: `3${a}(${a}x + ${b})^2`,
          distractors: [
            `3(${a}x + ${b})^2`,
            `3${a}(${a}x + ${b})^3`,
            `(${3 * a}x)^2`
          ]
        };
      }
    }
  ];
  const { question, correct_answer, distractors } = pick(fns).gen();
  return { question, correct_answer, distractors, difficulty: "medium", topic: "Derivatives", explanation: "" };
}

function tpl_product_rule() {
  const a = randNonZeroInt(-5, 5);
  const n = randInt(2, 5);
  const q = `\\frac{d}{dx}\\left[${a}x^{${n}} e^x\\right]`;
  const correct = `${a}x^{${n}}e^x + ${a * n}x^{${n - 1}}e^x`;
  return {
    question: q,
    correct_answer: correct,
    distractors: [
      `${a}x^{${n}}e^x`,
      `${a * n}x^{${n - 1}}e^x`,
      `${a}x^{${n + 1}}e^x + ${a * n}x^{${n}}e^x`
    ],
    difficulty: "medium",
    topic: "Derivatives",
    explanation: `Product rule: (uv)' = u'v + uv'. Here u=${a}x^${n}, v=e^x.`
  };
}

function tpl_definite_integral() {
  const n = randInt(3, 6);
  const lo = randInt(1, 3);
  const hi = lo + randInt(2, 4);
  const ans = Math.pow(hi, n) - Math.pow(lo, n);

  const d1 = ans + randNonZeroInt(1, 5);
  const d2 = Math.pow(hi, n);
  let d3 = Math.pow(lo, n) + ans;
  if (d3 === ans || d3 === d1 || d3 === d2) d3 = ans - randInt(2, 10);

  return {
    question: `\\int_{${lo}}^{${hi}} ${n}x^{${n - 1}}\\,dx`,
    correct_answer: `${ans}`,
    distractors: [`${d1}`, `${d2}`, `${d3}`],
    difficulty: "medium",
    topic: "Integrals",
    explanation: `FTC: \\left[x^{${n}}\\right]_{${lo}}^{${hi}} = ${hi}^{${n}} - ${lo}^{${n}} = ${ans}`
  };
}

function tpl_limit_rational() {
  const a = randNonZeroInt(-6, 6);
  const ans = 2 * a;
  const d1 = ans + (a > 0 ? 1 : -1);
  const d2 = a;
  let d3 = ans - 2;
  if (d3 === ans || d3 === d1 || d3 === d2) d3 = ans + 3;
  return {
    question: `\\lim_{x \\to ${a}} \\frac{x^2 - ${a * a}}{x - ${a}}`,
    correct_answer: `${ans}`,
    distractors: [`${d1}`, `${d2}`, `${d3}`],
    difficulty: "medium",
    topic: "Limits",
    explanation: `Factor: (x²-${a * a})/(x-${a}) = x+${a}. At x=${a}: ${a}+${a}=${ans}.`
  };
}

function tpl_log_solve() {
  const b = pick([2, 3, 5, 10]);
  const n = randInt(2, 4);
  const x = Math.pow(b, n);
  const d1 = x + 1;
  const d2 = b * n;
  const d3 = n * b - 1;
  const used = new Set([x, d1, d2, d3]);
  const safe = (v, fallback) => used.has(v) ? fallback : v;

  return {
    question: `\\log_{${b}}(x) = ${n}`,
    correct_answer: `x = ${x}`,
    distractors: [
      `x = ${safe(d1, x + 2)}`,
      `x = ${safe(d2, x - 2)}`,
      `x = ${safe(d3, x + 3)}`
    ],
    difficulty: "medium",
    topic: "Algebra",
    explanation: `By definition: x = ${b}^{${n}} = ${x}`
  };
}

function tpl_trig_identity() {
  const identities = [
    {
      question: "\\sin^2(x) + \\cos^2(x)",
      correct_answer: "1",
      distractors: ["0", "2", "\\sin(2x)"]
    },
    {
      question: "\\cos(2x)",
      correct_answer: "1 - 2\\sin^2(x)",
      distractors: ["2\\cos^2(x)", "\\cos^2(x) - \\sin^2(x) + 1", "2\\sin(x)\\cos(x)"]
    },
    {
      question: "\\sin(2x)",
      correct_answer: "2\\sin(x)\\cos(x)",
      distractors: ["\\sin^2(x) - \\cos^2(x)", "2\\sin^2(x)", "\\cos(2x)"]
    },
    {
      question: "1 + \\tan^2(x)",
      correct_answer: "\\sec^2(x)",
      distractors: ["\\csc^2(x)", "1", "\\cos^2(x)"]
    }
  ];
  const id = pick(identities);
  return {
    ...id,
    difficulty: "medium",
    topic: "Trigonometry",
    explanation: ""
  };
}

// ── HARD TEMPLATES ────────────────────────────────────────────────────────────

function tpl_integration_by_parts() {
  const a = randNonZeroInt(-4, 4);
  return {
    question: `\\int x e^{${a}x}\\,dx`,
    correct_answer: `\\frac{e^{${a}x}}{${a}}\\!\\left(x - \\frac{1}{${a}}\\right) + C`,
    distractors: [
      `xe^{${a}x} + C`,
      `\\frac{x e^{${a}x}}{${a}} + C`,
      `e^{${a}x}\\left(\\frac{x}{${a}} + \\frac{1}{${a * a}}\\right) + C`
    ],
    difficulty: "hard",
    topic: "Integrals",
    explanation: `IBP: u=x, dv=e^{${a}x}dx. du=dx, v=e^{${a}x}/${a}.`
  };
}

function tpl_partial_fractions() {
  const classics = [
    {
      question: "\\int \\frac{1}{x^2-1}\\,dx",
      correct_answer: "\\frac{1}{2}\\ln\\left|\\frac{x-1}{x+1}\\right|+C",
      distractors: [
        "\\ln|x^2-1|+C",
        "\\frac{1}{2}\\ln|x^2-1|+C",
        "\\arctan x+C"
      ]
    },
    {
      question: "\\int \\frac{1}{x^2+x}\\,dx",
      correct_answer: "\\ln\\left|\\frac{x}{x+1}\\right|+C",
      distractors: [
        "\\ln|x^2+x|+C",
        "\\frac{1}{2x+1}+C",
        "\\ln|x|+C"
      ]
    },
    {
      question: "\\int \\frac{2x}{x^2-4}\\,dx",
      correct_answer: "\\ln|x^2-4|+C",
      distractors: [
        "2\\ln|x^2-4|+C",
        "\\frac{1}{x^2-4}+C",
        "\\ln\\left|\\frac{x-2}{x+2}\\right|+C"
      ]
    }
  ];
  const c = pick(classics);
  return { ...c, difficulty: "hard", topic: "Integrals", explanation: "" };
}

function tpl_implicit_differentiation() {
  const r = randInt(2, 8);
  return {
    question: `\\text{If } x^2 + y^2 = ${r * r}, \\text{ find } \\dfrac{dy}{dx}`,
    correct_answer: "-\\dfrac{x}{y}",
    distractors: [
      "\\dfrac{x}{y}",
      "-\\dfrac{y}{x}",
      "-\\dfrac{2x}{2y+1}"
    ],
    difficulty: "hard",
    topic: "Derivatives",
    explanation: `Differentiate both sides: 2x + 2y(dy/dx) = 0 → dy/dx = -x/y.`
  };
}

function tpl_taylor_series() {
  const classics = [
    {
      question: "\\text{First 3 nonzero terms of the Maclaurin series for } e^x",
      correct_answer: "1 + x + \\dfrac{x^2}{2!}",
      distractors: [
        "1 + x + \\dfrac{x^2}{2}",
        "x + x^2 + x^3",
        "1 - x + \\dfrac{x^2}{2!}"
      ]
    },
    {
      question: "\\text{First 3 nonzero terms of the Maclaurin series for } \\sin x",
      correct_answer: "x - \\dfrac{x^3}{3!} + \\dfrac{x^5}{5!}",
      distractors: [
        "x + \\dfrac{x^3}{3!} + \\dfrac{x^5}{5!}",
        "1 - \\dfrac{x^2}{2!} + \\dfrac{x^4}{4!}",
        "x - \\dfrac{x^3}{6} + \\dfrac{x^5}{120}"
      ]
    },
    {
      question: "\\text{First 3 nonzero terms of the Maclaurin series for } \\cos x",
      correct_answer: "1 - \\dfrac{x^2}{2!} + \\dfrac{x^4}{4!}",
      distractors: [
        "1 + \\dfrac{x^2}{2!} + \\dfrac{x^4}{4!}",
        "x - \\dfrac{x^3}{3!} + \\dfrac{x^5}{5!}",
        "1 - \\dfrac{x^2}{2} + \\dfrac{x^4}{24}"
      ]
    }
  ];
  const c = pick(classics);
  return { ...c, difficulty: "hard", topic: "Series", explanation: "" };
}

function tpl_lhopital() {
  const cases = [
    {
      question: "\\lim_{x \\to 0} \\frac{\\sin x}{x}",
      correct_answer: "1",
      distractors: ["0", "\\infty", "\\frac{1}{2}"]
    },
    {
      question: "\\lim_{x \\to 0} \\frac{e^x - 1}{x}",
      correct_answer: "1",
      distractors: ["0", "e", "\\infty"]
    },
    {
      question: "\\lim_{x \\to \\infty} \\frac{\\ln x}{x}",
      correct_answer: "0",
      distractors: ["1", "\\infty", "e"]
    },
    {
      question: "\\lim_{x \\to 0} \\frac{1 - \\cos x}{x^2}",
      correct_answer: "\\dfrac{1}{2}",
      distractors: ["1", "0", "\\dfrac{1}{4}"]
    }
  ];
  const c = pick(cases);
  return { ...c, difficulty: "hard", topic: "Limits", explanation: "Apply L'Hôpital's rule." };
}

function tpl_eigenvalue() {
  const matrices = [
    {
      question: "\\text{Eigenvalues of } \\begin{pmatrix}3 & 1\\\\ 1 & 3\\end{pmatrix}",
      correct_answer: "\\lambda = 2,\\; 4",
      distractors: ["\\lambda = 1,\\; 9", "\\lambda = 3,\\; 3", "\\lambda = 0,\\; 6"]
    },
    {
      question: "\\text{Eigenvalues of } \\begin{pmatrix}2 & 0\\\\ 0 & 5\\end{pmatrix}",
      correct_answer: "\\lambda = 2,\\; 5",
      distractors: ["\\lambda = 7,\\; 0", "\\lambda = 3,\\; 4", "\\lambda = 10,\\; 1"]
    },
    {
      question: "\\text{Eigenvalues of } \\begin{pmatrix}1 & 2\\\\ 2 & 1\\end{pmatrix}",
      correct_answer: "\\lambda = -1,\\; 3",
      distractors: ["\\lambda = 1,\\; 1", "\\lambda = 2,\\; 2", "\\lambda = 0,\\; 2"]
    }
  ];
  const c = pick(matrices);
  return { ...c, difficulty: "hard", topic: "Linear Algebra", explanation: "" };
}

// ══════════════════════════════════════════════════════════════════════════════
// NEW TEMPLATES — MEDIUM
// ══════════════════════════════════════════════════════════════════════════════

// ── Quotient rule ─────────────────────────────────────────────────────────────
function tpl_quotient_rule() {
  const cases = [
    {
      question: "\\frac{d}{dx}\\left[\\frac{x^2}{e^x}\\right]",
      correct_answer: "\\frac{x(2 - x)}{e^x}",
      distractors: [
        "\\frac{2x}{e^x}",
        "\\frac{x^2 - 2x}{e^x}",
        "\\frac{2x + x^2}{e^x}"
      ],
      explanation: "Quotient rule: (x^2 · e^x - x^2 · e^x) / e^{2x} = x(2-x)/e^x."
    },
    {
      question: "\\frac{d}{dx}\\left[\\frac{\\sin x}{x}\\right]",
      correct_answer: "\\frac{x\\cos x - \\sin x}{x^2}",
      distractors: [
        "\\frac{\\cos x}{x}",
        "\\frac{x\\cos x + \\sin x}{x^2}",
        "\\frac{\\cos x - \\sin x}{x^2}"
      ],
      explanation: "Quotient rule: (x cos x - sin x) / x²."
    },
    {
      question: "\\frac{d}{dx}\\left[\\frac{\\ln x}{x^2}\\right]",
      correct_answer: "\\frac{1 - 2\\ln x}{x^3}",
      distractors: [
        "\\frac{1 + 2\\ln x}{x^3}",
        "\\frac{1}{x^3}",
        "\\frac{2\\ln x - 1}{x^3}"
      ],
      explanation: "Quotient rule: (1/x · x² - 2x ln x) / x⁴ = (1 - 2 ln x)/x³."
    }
  ];
  const c = pick(cases);
  return { ...c, difficulty: "medium", topic: "Derivatives" };
}

// ── Convergence of series (ratio/integral test) ────────────────────────────────
function tpl_series_convergence() {
  const cases = [
    {
      question: "\\text{Does } \\sum_{n=1}^{\\infty} \\frac{1}{n^2} \\text{ converge or diverge?}",
      correct_answer: "\\text{Converges (p-series, } p=2>1\\text{)}",
      distractors: [
        "\\text{Diverges (p-series, } p<1\\text{)}",
        "\\text{Diverges (harmonic series)}",
        "\\text{Converges only conditionally}"
      ]
    },
    {
      question: "\\text{Does } \\sum_{n=1}^{\\infty} \\frac{1}{n} \\text{ converge or diverge?}",
      correct_answer: "\\text{Diverges (harmonic series)}",
      distractors: [
        "\\text{Converges to } \\ln 2",
        "\\text{Converges to 1}",
        "\\text{Converges (p-series)}",
      ]
    },
    {
      question: "\\text{Does } \\sum_{n=0}^{\\infty} \\left(\\frac{1}{2}\\right)^n \\text{ converge? If so, to what?}",
      correct_answer: "\\text{Converges to } 2",
      distractors: [
        "\\text{Diverges}",
        "\\text{Converges to } 1",
        "\\text{Converges to } \\frac{1}{2}"
      ]
    },
    {
      question: "\\text{Does } \\sum_{n=1}^{\\infty} \\frac{n}{e^n} \\text{ converge or diverge?}",
      correct_answer: "\\text{Converges (ratio test: } L = 1/e < 1\\text{)}",
      distractors: [
        "\\text{Diverges (ratio test: } L>1\\text{)}",
        "\\text{Diverges (integral test)}",
        "\\text{Converges only conditionally}"
      ]
    }
  ];
  const c = pick(cases);
  return { ...c, difficulty: "medium", topic: "Series", explanation: "" };
}

// ── Inverse trig derivatives ───────────────────────────────────────────────────
function tpl_inverse_trig_derivative() {
  const cases = [
    {
      question: "\\frac{d}{dx}\\left[\\arcsin(x)\\right]",
      correct_answer: "\\dfrac{1}{\\sqrt{1-x^2}}",
      distractors: [
        "\\dfrac{-1}{\\sqrt{1-x^2}}",
        "\\dfrac{1}{1+x^2}",
        "\\dfrac{1}{\\sqrt{1+x^2}}"
      ]
    },
    {
      question: "\\frac{d}{dx}\\left[\\arctan(x)\\right]",
      correct_answer: "\\dfrac{1}{1+x^2}",
      distractors: [
        "\\dfrac{-1}{1+x^2}",
        "\\dfrac{1}{\\sqrt{1-x^2}}",
        "\\sec^2(x)"
      ]
    },
    {
      question: "\\frac{d}{dx}\\left[\\arccos(x)\\right]",
      correct_answer: "\\dfrac{-1}{\\sqrt{1-x^2}}",
      distractors: [
        "\\dfrac{1}{\\sqrt{1-x^2}}",
        "\\dfrac{1}{1+x^2}",
        "\\dfrac{-1}{1+x^2}"
      ]
    }
  ];
  const c = pick(cases);
  return { ...c, difficulty: "medium", topic: "Derivatives", explanation: "" };
}

// ── Related rates ────────────────────────────────────────────────────────────
function tpl_related_rates() {
  const cases = [
    {
      question: "\\text{A sphere's radius grows at } 2\\text{ cm/s. Rate of volume change when } r=3\\text{ cm?}",
      correct_answer: "72\\pi \\text{ cm}^3/\\text{s}",
      distractors: [
        "36\\pi \\text{ cm}^3/\\text{s}",
        "18\\pi \\text{ cm}^3/\\text{s}",
        "12\\pi \\text{ cm}^3/\\text{s}"
      ],
      explanation: "V = (4/3)πr³, dV/dt = 4πr² dr/dt = 4π(9)(2) = 72π."
    },
    {
      question: "\\text{A ladder 10 m long slides down a wall. When the base is 6 m from the wall and moving at 2 m/s, how fast is the top sliding down?}",
      correct_answer: "\\dfrac{3}{2} \\text{ m/s}",
      distractors: [
        "2 \\text{ m/s}",
        "\\dfrac{4}{3} \\text{ m/s}",
        "\\dfrac{3}{4} \\text{ m/s}"
      ],
      explanation: "x²+y²=100. Differentiate: 2x(dx/dt)+2y(dy/dt)=0. y=8, dy/dt = -6·2/8 = -3/2."
    }
  ];
  const c = pick(cases);
  return { ...c, difficulty: "medium", topic: "Derivatives" };
}

// ── Complex numbers ───────────────────────────────────────────────────────────
function tpl_complex_arithmetic() {
  const cases = [
    {
      question: "\\text{Simplify } (3+4i)(2-i)",
      correct_answer: "10 + 5i",
      distractors: ["6 + 5i", "10 - 5i", "6 - 5i"],
      explanation: "(3+4i)(2-i) = 6 - 3i + 8i - 4i² = 6 + 5i + 4 = 10 + 5i."
    },
    {
      question: "\\text{Modulus of } 3 + 4i",
      correct_answer: "5",
      distractors: ["7", "\\sqrt{7}", "25"],
      explanation: "|3+4i| = √(9+16) = √25 = 5."
    },
    {
      question: "\\text{Simplify } i^{47}",
      correct_answer: "-i",
      distractors: ["i", "1", "-1"],
      explanation: "Powers of i cycle with period 4. 47 = 4·11 + 3, so i^47 = i^3 = -i."
    },
    {
      question: "\\text{Simplify } \\dfrac{1}{1+i}",
      correct_answer: "\\dfrac{1-i}{2}",
      distractors: [
        "\\dfrac{1+i}{2}",
        "1-i",
        "\\dfrac{1}{2}+i"
      ],
      explanation: "Multiply by conjugate: (1-i)/((1+i)(1-i)) = (1-i)/2."
    }
  ];
  const c = pick(cases);
  return { ...c, difficulty: "medium", topic: "Complex Numbers" };
}

// ── Matrix multiplication ─────────────────────────────────────────────────────
function tpl_matrix_multiply() {
  // Pick simple 2×2 matrices with small entries
  const a11 = randInt(1, 3), a12 = randInt(0, 2), a21 = randInt(0, 2), a22 = randInt(1, 3);
  const b11 = randInt(1, 3), b12 = randInt(0, 2), b21 = randInt(0, 2), b22 = randInt(1, 3);
  const c11 = a11*b11 + a12*b21;
  const c12 = a11*b12 + a12*b22;
  const c21 = a21*b11 + a22*b21;
  const c22 = a21*b12 + a22*b22;
  const matTex = (a,b,c,d) => `\\begin{pmatrix}${a}&${b}\\\\${c}&${d}\\end{pmatrix}`;
  return {
    question: `${matTex(a11,a12,a21,a22)}${matTex(b11,b12,b21,b22)}`,
    correct_answer: matTex(c11,c12,c21,c22),
    distractors: [
      matTex(c11+1,c12,c21,c22),
      matTex(a11*b11,a12*b12,a21*b21,a22*b22),  // element-wise (wrong)
      matTex(c11,c12+1,c21,c22-1)
    ],
    difficulty: "medium",
    topic: "Linear Algebra",
    explanation: "Row × Column: C_{ij} = Σ A_{ik}B_{kj}."
  };
}

// ── Separable ODEs ─────────────────────────────────────────────────────────────
function tpl_separable_ode() {
  const cases = [
    {
      question: "\\text{Solve: } \\dfrac{dy}{dx} = ky, \\; y(0)=y_0",
      correct_answer: "y = y_0 e^{kx}",
      distractors: [
        "y = y_0 + kx",
        "y = y_0 e^{x/k}",
        "y = e^{ky_0 x}"
      ],
      explanation: "Separate: dy/y = k dx → ln|y| = kx + C → y = y₀e^{kx}."
    },
    {
      question: "\\text{Solve: } \\dfrac{dy}{dx} = \\dfrac{x}{y}",
      correct_answer: "y^2 - x^2 = C",
      distractors: [
        "y = x + C",
        "y^2 + x^2 = C",
        "y = \\dfrac{x^2}{2} + C"
      ],
      explanation: "Separate: y dy = x dx → y²/2 = x²/2 + C₀ → y² - x² = C."
    },
    {
      question: "\\text{Solve: } \\dfrac{dy}{dx} = -2xy",
      correct_answer: "y = Ce^{-x^2}",
      distractors: [
        "y = Ce^{-2x}",
        "y = Ce^{x^2}",
        "y = Ce^{-2x^2}"
      ],
      explanation: "Separate: dy/y = -2x dx → ln|y| = -x² + C₀ → y = Ce^{-x²}."
    }
  ];
  const c = pick(cases);
  return { ...c, difficulty: "medium", topic: "Differential Equations" };
}

// ── Probability ───────────────────────────────────────────────────────────────
function tpl_probability_basic() {
  const cases = [
    {
      question: "\\text{P(A∪B) if P(A)=0.4, P(B)=0.3, P(A∩B)=0.1}",
      correct_answer: "0.6",
      distractors: ["0.7", "0.5", "0.12"],
      explanation: "P(A∪B) = P(A)+P(B)-P(A∩B) = 0.4+0.3-0.1 = 0.6."
    },
    {
      question: "\\text{In 5 fair coin flips, P(exactly 3 heads)}",
      correct_answer: "\\dfrac{5}{16}",
      distractors: [
        "\\dfrac{3}{16}",
        "\\dfrac{1}{8}",
        "\\dfrac{3}{8}"
      ],
      explanation: "C(5,3)/2^5 = 10/32 = 5/16."
    },
    {
      question: "\\text{P(A|B) if P(A∩B)=0.12 and P(B)=0.4}",
      correct_answer: "0.3",
      distractors: ["0.48", "0.3", "0.052"],
      explanation: "P(A|B) = P(A∩B)/P(B) = 0.12/0.4 = 0.3."
    }
  ];
  const c = pick(cases);
  return { ...c, difficulty: "medium", topic: "Probability" };
}

// ══════════════════════════════════════════════════════════════════════════════
// NEW TEMPLATES — HARD
// ══════════════════════════════════════════════════════════════════════════════

// ── Multivariable calculus: partial derivatives ───────────────────────────────
function tpl_partial_derivative() {
  const cases = [
    {
      question: "\\text{If } f(x,y)=x^3y^2+\\sin(xy), \\text{ find } f_x",
      correct_answer: "3x^2y^2 + y\\cos(xy)",
      distractors: [
        "3x^2y^2 - y\\cos(xy)",
        "x^3 \\cdot 2y + \\cos(xy)",
        "3x^2 \\cdot 2y + \\cos(xy)"
      ],
      explanation: "Differentiate w.r.t. x treating y as constant: 3x²y² + y cos(xy)."
    },
    {
      question: "\\text{If } f(x,y)=e^{x^2+y^2}, \\text{ find } f_y",
      correct_answer: "2y\\,e^{x^2+y^2}",
      distractors: [
        "2x\\,e^{x^2+y^2}",
        "e^{2y}",
        "(x^2+y^2)\\,e^{x^2+y^2}"
      ],
      explanation: "Chain rule: f_y = 2y · e^{x²+y²}."
    },
    {
      question: "\\text{If } f(x,y) = x^2y - xy^3, \\text{ find } f_{xy}",
      correct_answer: "2x - 3y^2",
      distractors: [
        "2y - 3x^2",
        "2x + 3y^2",
        "-3y^2"
      ],
      explanation: "f_x = 2xy - y³. Then (f_x)_y = 2x - 3y²."
    }
  ];
  const c = pick(cases);
  return { ...c, difficulty: "hard", topic: "Multivariable Calculus" };
}

// ── Double integrals ──────────────────────────────────────────────────────────
function tpl_double_integral() {
  const cases = [
    {
      question: "\\int_0^1 \\int_0^1 (x + y)\\,dx\\,dy",
      correct_answer: "1",
      distractors: ["\\dfrac{1}{2}", "2", "\\dfrac{3}{2}"],
      explanation: "Inner: ∫₀¹(x+y)dx = 1/2+y. Outer: ∫₀¹(1/2+y)dy = 1/2+1/2 = 1."
    },
    {
      question: "\\int_0^2 \\int_0^3 xy\\,dy\\,dx",
      correct_answer: "9",
      distractors: ["6", "18", "\\dfrac{9}{2}"],
      explanation: "Inner: ∫₀³ xy dy = x·9/2. Outer: ∫₀²(9x/2)dx = 9/2·2 = 9."
    },
    {
      question: "\\int_0^{\\pi} \\int_0^{1} r\\,dr\\,d\\theta",
      correct_answer: "\\dfrac{\\pi}{2}",
      distractors: ["\\pi", "\\dfrac{1}{2}", "2\\pi"],
      explanation: "Inner: ∫₀¹ r dr = 1/2. Outer: ∫₀^π (1/2) dθ = π/2."
    }
  ];
  const c = pick(cases);
  return { ...c, difficulty: "hard", topic: "Multivariable Calculus" };
}

// ── Gradient, divergence, curl ────────────────────────────────────────────────
function tpl_gradient() {
  const cases = [
    {
      question: "\\nabla f \\text{ where } f(x,y,z) = x^2y + yz^2",
      correct_answer: "\\langle 2xy,\\; x^2 + z^2,\\; 2yz \\rangle",
      distractors: [
        "\\langle 2x,\\; 1,\\; 2z \\rangle",
        "\\langle 2xy,\\; x^2 - z^2,\\; 2yz \\rangle",
        "\\langle y,\\; x^2+z^2,\\; z \\rangle"
      ],
      explanation: "f_x=2xy, f_y=x²+z², f_z=2yz."
    },
    {
      question: "\\text{div}(\\mathbf{F}) \\text{ where } \\mathbf{F} = \\langle x^2, y^2, z^2 \\rangle",
      correct_answer: "2x + 2y + 2z",
      distractors: [
        "x^2 + y^2 + z^2",
        "2xyz",
        "2x^2 + 2y^2 + 2z^2"
      ],
      explanation: "div F = ∂(x²)/∂x + ∂(y²)/∂y + ∂(z²)/∂z = 2x+2y+2z."
    }
  ];
  const c = pick(cases);
  return { ...c, difficulty: "hard", topic: "Multivariable Calculus" };
}

// ── Fourier series ────────────────────────────────────────────────────────────
function tpl_fourier_series() {
  const cases = [
    {
      question: "\\text{The Fourier series of } f(x) = x \\text{ on } [-\\pi, \\pi] \\text{ is:}",
      correct_answer: "2\\sum_{n=1}^{\\infty} \\dfrac{(-1)^{n+1}}{n}\\sin(nx)",
      distractors: [
        "\\sum_{n=1}^{\\infty} \\dfrac{\\sin(nx)}{n}",
        "2\\sum_{n=1}^{\\infty} \\dfrac{\\sin(nx)}{n}",
        "\\sum_{n=1}^{\\infty} \\dfrac{(-1)^n}{n}\\sin(nx)"
      ],
      explanation: "Odd function → only sine terms. b_n = (2/T)∫x sin(nx)dx = 2(-1)^{n+1}/n."
    },
    {
      question: "\\text{The } a_0 \\text{ term in the Fourier series of } f(x)=|x| \\text{ on } [-\\pi,\\pi]",
      correct_answer: "\\dfrac{\\pi}{2}",
      distractors: ["0", "\\pi", "\\dfrac{\\pi}{4}"],
      explanation: "a₀ = (1/π)∫₋ᵨᵨ |x| dx = (2/π)∫₀^π x dx = (2/π)(π²/2) = π. So a₀/2 = π/2."
    }
  ];
  const c = pick(cases);
  return { ...c, difficulty: "hard", topic: "Series" };
}

// ── Laplace transforms ────────────────────────────────────────────────────────
function tpl_laplace() {
  const cases = [
    {
      question: "\\mathcal{L}\\{e^{at}\\}",
      correct_answer: "\\dfrac{1}{s-a}, \\; s > a",
      distractors: [
        "\\dfrac{1}{s+a}",
        "\\dfrac{a}{s^2+a^2}",
        "\\dfrac{s}{s^2-a^2}"
      ],
      explanation: "By definition: ∫₀^∞ e^{at}e^{-st}dt = 1/(s-a) for s>a."
    },
    {
      question: "\\mathcal{L}\\{\\sin(at)\\}",
      correct_answer: "\\dfrac{a}{s^2+a^2}",
      distractors: [
        "\\dfrac{s}{s^2+a^2}",
        "\\dfrac{a}{s^2-a^2}",
        "\\dfrac{1}{s^2+a^2}"
      ],
      explanation: "Standard table: L{sin(at)} = a/(s²+a²)."
    },
    {
      question: "\\mathcal{L}\\{t^n\\} \\text{ for integer } n \\geq 0",
      correct_answer: "\\dfrac{n!}{s^{n+1}}",
      distractors: [
        "\\dfrac{(n-1)!}{s^n}",
        "\\dfrac{n}{s^{n+1}}",
        "\\dfrac{n!}{s^n}"
      ],
      explanation: "Standard result: L{t^n} = n!/s^{n+1}."
    },
    {
      question: "\\mathcal{L}^{-1}\\!\\left\\{\\dfrac{1}{s^2+9}\\right\\}",
      correct_answer: "\\dfrac{1}{3}\\sin(3t)",
      distractors: [
        "\\sin(3t)",
        "\\cos(3t)",
        "\\dfrac{1}{3}\\cos(3t)"
      ],
      explanation: "a=3: L^{-1}{a/(s²+a²)} = sin(at). Here factor out 1/3."
    }
  ];
  const c = pick(cases);
  return { ...c, difficulty: "hard", topic: "Differential Equations" };
}

// ── Second-order linear ODEs ───────────────────────────────────────────────────
function tpl_second_order_ode() {
  const cases = [
    {
      question: "\\text{General solution of } y'' - 5y' + 6y = 0",
      correct_answer: "y = C_1 e^{2x} + C_2 e^{3x}",
      distractors: [
        "y = C_1 e^{-2x} + C_2 e^{-3x}",
        "y = C_1 e^{2x} + C_2 e^{-3x}",
        "y = (C_1 + C_2 x)e^{3x}"
      ],
      explanation: "Char. eq: r²-5r+6=0 → r=2,3. General solution: C₁e^{2x}+C₂e^{3x}."
    },
    {
      question: "\\text{General solution of } y'' + 4y = 0",
      correct_answer: "y = C_1\\cos(2x) + C_2\\sin(2x)",
      distractors: [
        "y = C_1 e^{2x} + C_2 e^{-2x}",
        "y = C_1\\cos(4x) + C_2\\sin(4x)",
        "y = (C_1 + C_2 x)e^{2x}"
      ],
      explanation: "Char. eq: r²+4=0 → r=±2i. Solution: C₁cos(2x)+C₂sin(2x)."
    },
    {
      question: "\\text{General solution of } y'' - 4y' + 4y = 0",
      correct_answer: "y = (C_1 + C_2 x)e^{2x}",
      distractors: [
        "y = C_1 e^{2x} + C_2 e^{-2x}",
        "y = C_1 e^{4x} + C_2",
        "y = C_1\\cos(2x) + C_2\\sin(2x)"
      ],
      explanation: "Char. eq: (r-2)²=0 → r=2 (repeated). Solution: (C₁+C₂x)e^{2x}."
    }
  ];
  const c = pick(cases);
  return { ...c, difficulty: "hard", topic: "Differential Equations" };
}

// ── Linear algebra: determinants ──────────────────────────────────────────────
function tpl_determinant() {
  // Generate a 3×3 matrix with a known determinant
  const cases = [
    {
      question: "\\det\\begin{pmatrix}1&2&3\\\\0&4&5\\\\1&0&6\\end{pmatrix}",
      correct_answer: "22",
      distractors: ["18", "26", "-22"],
      explanation: "Cofactor expansion along row 1: 1(24-0)-2(0-5)+3(0-4) = 24+10-12 = 22."
    },
    {
      question: "\\det\\begin{pmatrix}2&-1&0\\\\3&2&1\\\\1&0&-2\\end{pmatrix}",
      correct_answer: "-15",
      distractors: ["-9", "15", "-11"],
      explanation: "Expand: 2(2·(-2)-1·0)-(-1)(3·(-2)-1·1)+0 = 2(-4)+1(-7) = -8-7 = -15."
    },
    {
      question: "\\det\\begin{pmatrix}1&0&0\\\\4&3&0\\\\7&2&5\\end{pmatrix}",
      correct_answer: "15",
      distractors: ["10", "-15", "30"],
      explanation: "Lower triangular: det = product of diagonal = 1·3·5 = 15."
    }
  ];
  const c = pick(cases);
  return { ...c, difficulty: "hard", topic: "Linear Algebra" };
}

// ── Linear algebra: diagonalization ──────────────────────────────────────────
function tpl_diagonalization() {
  const cases = [
    {
      question: "\\text{Is } A = \\begin{pmatrix}2&1\\\\0&2\\end{pmatrix} \\text{ diagonalizable over } \\mathbb{R}?",
      correct_answer: "\\text{No — repeated eigenvalue } \\lambda=2 \\text{ with only one independent eigenvector}",
      distractors: [
        "\\text{Yes — it has two distinct real eigenvalues}",
        "\\text{Yes — all triangular matrices are diagonalizable}",
        "\\text{No — it has no real eigenvalues}"
      ],
      explanation: "λ=2 (algebraic mult 2). Rank(A-2I)=1, so geometric mult=1 < 2. Not diagonalizable."
    },
    {
      question: "\\text{If } A \\text{ is } n\\times n \\text{ with } n \\text{ distinct eigenvalues, then}",
      correct_answer: "A \\text{ is diagonalizable}",
      distractors: [
        "A \\text{ may or may not be diagonalizable}",
        "A \\text{ is not diagonalizable}",
        "A \\text{ is diagonalizable only if symmetric}"
      ],
      explanation: "n distinct eigenvalues ⟹ n linearly independent eigenvectors ⟹ diagonalizable."
    }
  ];
  const c = pick(cases);
  return { ...c, difficulty: "hard", topic: "Linear Algebra" };
}

// ── Abstract algebra: group theory ────────────────────────────────────────────
function tpl_group_theory() {
  const cases = [
    {
      question: "\\text{Order of the element } 3 \\text{ in } (\\mathbb{Z}_8, +)",
      correct_answer: "8",
      distractors: ["3", "4", "6"],
      explanation: "gcd(3,8)=1, so order = 8/gcd(3,8) = 8."
    },
    {
      question: "\\text{How many elements of order 2 does } \\mathbb{Z}_2 \\times \\mathbb{Z}_2 \\text{ have?}",
      correct_answer: "3",
      distractors: ["1", "2", "4"],
      explanation: "Elements: (0,0),(1,0),(0,1),(1,1). All non-identity have order 2. Count = 3."
    },
    {
      question: "\\text{Which is NOT a group under standard operation?}",
      correct_answer: "(\\mathbb{Z}, \\times)",
      distractors: [
        "(\\mathbb{Z}, +)",
        "(\\mathbb{R}\\setminus\\{0\\}, \\times)",
        "(\\mathbb{Q}, +)"
      ],
      explanation: "ℤ under × fails: no multiplicative inverse for 2 in ℤ."
    },
    {
      question: "\\text{The number of distinct subgroups of } \\mathbb{Z}_{12}",
      correct_answer: "6",
      distractors: ["4", "12", "3"],
      explanation: "Subgroups of Z_n correspond to divisors of n. Divisors of 12: 1,2,3,4,6,12 → 6 subgroups."
    }
  ];
  const c = pick(cases);
  return { ...c, difficulty: "hard", topic: "Abstract Algebra" };
}

// ── Number theory ─────────────────────────────────────────────────────────────
function tpl_number_theory() {
  const cases = [
    {
      question: "\\text{Solve } 3x \\equiv 1 \\pmod{7}",
      correct_answer: "x \\equiv 5 \\pmod{7}",
      distractors: [
        "x \\equiv 3 \\pmod{7}",
        "x \\equiv 2 \\pmod{7}",
        "x \\equiv 4 \\pmod{7}"
      ],
      explanation: "3·5=15≡1 (mod 7). So x≡5."
    },
    {
      question: "\\text{By Fermat's little theorem, } 2^{100} \\pmod{101}",
      correct_answer: "1",
      distractors: ["2", "100", "0"],
      explanation: "101 is prime and gcd(2,101)=1. Fermat: 2^{100}≡1 (mod 101)."
    },
    {
      question: "\\phi(36) = ?",
      correct_answer: "12",
      distractors: ["18", "24", "6"],
      explanation: "36=2²·3². φ(36)=36(1-1/2)(1-1/3)=36·1/2·2/3=12."
    },
    {
      question: "\\text{gcd}(252, 198)",
      correct_answer: "18",
      distractors: ["6", "9", "36"],
      explanation: "252=198·1+54; 198=54·3+36; 54=36·1+18; 36=18·2. gcd=18."
    }
  ];
  const c = pick(cases);
  return { ...c, difficulty: "hard", topic: "Number Theory" };
}

// ── Real analysis: epsilon-delta and continuity ────────────────────────────────
function tpl_real_analysis() {
  const cases = [
    {
      question: "\\text{Which function has a removable discontinuity at } x=1?",
      correct_answer: "f(x) = \\dfrac{x^2-1}{x-1}",
      distractors: [
        "f(x) = \\dfrac{1}{x-1}",
        "f(x) = |x-1|",
        "f(x) = \\lfloor x \\rfloor \\text{ at } x=1"
      ],
      explanation: "(x²-1)/(x-1) = x+1 for x≠1; limit exists but function undefined at 1 → removable."
    },
    {
      question: "\\text{Sup of the set } S = \\{1 - 1/n : n \\in \\mathbb{N}\\}",
      correct_answer: "1",
      distractors: [
        "\\text{Does not exist (S unbounded)}",
        "1/2",
        "0"
      ],
      explanation: "S = {0, 1/2, 2/3, 3/4, ...}. Values increase to 1 but never reach it. sup S = 1."
    },
    {
      question: "\\text{A function } f:[a,b]\\to\\mathbb{R} \\text{ that is continuous on a closed bounded interval is:}",
      correct_answer: "\\text{Uniformly continuous on } [a,b]",
      distractors: [
        "\\text{Not necessarily uniformly continuous}",
        "\\text{Differentiable everywhere on } [a,b]",
        "\\text{Lipschitz continuous on } [a,b]"
      ],
      explanation: "Heine-Cantor theorem: continuous on compact set ⟹ uniformly continuous."
    }
  ];
  const c = pick(cases);
  return { ...c, difficulty: "hard", topic: "Real Analysis" };
}

// ── Combinatorics and generating functions ─────────────────────────────────────
function tpl_combinatorics() {
  const cases = [
    {
      question: "\\text{Number of ways to distribute 10 identical balls into 4 distinct boxes}",
      correct_answer: "\\binom{13}{3} = 286",
      distractors: ["\\binom{10}{4}=210", "4^{10}", "\\binom{14}{4}=1001"],
      explanation: "Stars and bars: C(n+k-1, k-1) = C(13,3) = 286."
    },
    {
      question: "\\text{Number of derangements of 4 elements}",
      correct_answer: "9",
      distractors: ["8", "11", "24"],
      explanation: "D_4 = 4!(1 - 1 + 1/2! - 1/3! + 1/4!) = 24(1/2 - 1/6 + 1/24) = 12-4+1 = 9."
    },
    {
      question: "\\text{Coefficient of } x^3 \\text{ in } (1+x)^{10}",
      correct_answer: "120",
      distractors: ["90", "210", "30"],
      explanation: "Binomial theorem: C(10,3) = 120."
    },
    {
      question: "\\text{Number of surjective functions from a 4-set to a 3-set}",
      correct_answer: "36",
      distractors: ["81", "24", "60"],
      explanation: "Inclusion-exclusion: 3⁴ - 3·2⁴ + 3·1⁴ = 81-48+3 = 36."
    }
  ];
  const c = pick(cases);
  return { ...c, difficulty: "hard", topic: "Combinatorics" };
}

// ── Topology / metric spaces ──────────────────────────────────────────────────
function tpl_topology() {
  const cases = [
    {
      question: "\\text{Is } [0,1] \\text{ compact in } \\mathbb{R}?",
      correct_answer: "\\text{Yes — closed and bounded (Heine-Borel)}",
      distractors: [
        "\\text{No — not open}",
        "\\text{Yes — but only because it is connected}",
        "\\text{No — it is not complete}"
      ],
      explanation: "By Heine-Borel: a subset of R^n is compact iff it is closed and bounded."
    },
    {
      question: "\\text{The open ball } B(0,1) \\text{ in } \\mathbb{R} \\text{ is the set:}",
      correct_answer: "(-1, 1)",
      distractors: ["[-1,1]", "\\{x : |x|\\leq 1\\}", "\\{0\\}"],
      explanation: "B(0,1) = {x ∈ ℝ : |x-0| < 1} = (-1,1)."
    },
    {
      question: "\\text{In a metric space, every convergent sequence is:}",
      correct_answer: "\\text{Cauchy}",
      distractors: [
        "\\text{Bounded but not necessarily Cauchy}",
        "\\text{Monotone}",
        "\\text{Constant}"
      ],
      explanation: "If x_n → L, then for large m,n, d(x_m,x_n) ≤ d(x_m,L)+d(L,x_n) → 0."
    }
  ];
  const c = pick(cases);
  return { ...c, difficulty: "hard", topic: "Topology" };
}

// ── Statistics: hypothesis testing and distributions ─────────────────────────
function tpl_statistics() {
  const cases = [
    {
      question: "\\text{For } X \\sim N(\\mu, \\sigma^2), \\; P(\\mu - \\sigma < X < \\mu + \\sigma) \\approx",
      correct_answer: "0.6827",
      distractors: ["0.9545", "0.50", "0.9973"],
      explanation: "Empirical rule: ~68.27% of normal data falls within 1 standard deviation."
    },
    {
      question: "\\text{MLE of } \\mu \\text{ for } X_1,\\ldots,X_n \\overset{iid}{\\sim} N(\\mu,\\sigma^2)",
      correct_answer: "\\bar{X} = \\dfrac{1}{n}\\sum_{i=1}^n X_i",
      distractors: [
        "\\text{median}(X_i)",
        "\\dfrac{1}{n-1}\\sum_{i=1}^n X_i",
        "\\dfrac{\\max(X_i)+\\min(X_i)}{2}"
      ],
      explanation: "Maximizing the log-likelihood for Normal gives the sample mean."
    },
    {
      question: "\\text{For } X \\sim \\text{Poisson}(\\lambda), \\; \\text{Var}(X) = ",
      correct_answer: "\\lambda",
      distractors: ["\\lambda^2", "\\sqrt{\\lambda}", "\\dfrac{1}{\\lambda}"],
      explanation: "For Poisson, E[X] = Var(X) = λ."
    },
    {
      question: "\\text{The Central Limit Theorem states that, for large } n, \\; \\bar{X} \\text{ is approximately:}",
      correct_answer: "N\\!\\left(\\mu, \\dfrac{\\sigma^2}{n}\\right)",
      distractors: [
        "N(\\mu, \\sigma^2)",
        "N\\!\\left(0, 1\\right)",
        "N\\!\\left(\\mu, \\dfrac{\\sigma}{n}\\right)"
      ],
      explanation: "CLT: √n(X̄-μ)/σ → N(0,1), so X̄ ~ N(μ, σ²/n) approximately."
    }
  ];
  const c = pick(cases);
  return { ...c, difficulty: "hard", topic: "Statistics" };
}

// ── Complex analysis ──────────────────────────────────────────────────────────
function tpl_complex_analysis() {
  const cases = [
    {
      question: "\\oint_{|z|=2} \\frac{1}{z-1}\\,dz",
      correct_answer: "2\\pi i",
      distractors: ["0", "\\pi i", "4\\pi i"],
      explanation: "By Cauchy integral formula: ∮ dz/(z-a) = 2πi if |a|<r, 0 otherwise. Here a=1, r=2."
    },
    {
      question: "\\text{The residue of } \\dfrac{e^z}{z^2} \\text{ at } z=0",
      correct_answer: "1",
      distractors: ["0", "e", "\\dfrac{1}{2}"],
      explanation: "e^z/z² = (1+z+z²/2!+...)/z² = 1/z²+1/z+1/2+... Residue = coeff of 1/z = 1."
    },
    {
      question: "\\text{Cauchy-Riemann equations for } f=u+iv \\text{ are:}",
      correct_answer: "u_x = v_y, \\; u_y = -v_x",
      distractors: [
        "u_x = -v_y, \\; u_y = v_x",
        "u_x = v_x, \\; u_y = v_y",
        "u_x = v_y, \\; u_y = v_x"
      ],
      explanation: "Standard Cauchy-Riemann: ∂u/∂x = ∂v/∂y and ∂u/∂y = -∂v/∂x."
    }
  ];
  const c = pick(cases);
  return { ...c, difficulty: "hard", topic: "Complex Analysis" };
}

// ── Numerical methods ─────────────────────────────────────────────────────────
function tpl_numerical_methods() {
  const cases = [
    {
      question: "\\text{One step of Newton-Raphson on } f(x)=x^2-2 \\text{ starting at } x_0=1",
      correct_answer: "x_1 = 1.5",
      distractors: ["x_1 = 1.4", "x_1 = 1.2", "x_1 = 2"],
      explanation: "x₁ = x₀ - f(x₀)/f'(x₀) = 1 - (1-2)/(2) = 1 + 0.5 = 1.5."
    },
    {
      question: "\\text{Euler's method: } y'=y, \\; y(0)=1, \\; h=0.1. \\text{ Find } y_1",
      correct_answer: "1.1",
      distractors: ["1.105", "e^{0.1}", "1.01"],
      explanation: "y₁ = y₀ + h·f(x₀,y₀) = 1 + 0.1·1 = 1.1."
    },
    {
      question: "\\text{Order of convergence of Newton-Raphson for simple roots}",
      correct_answer: "\\text{Quadratic (order 2)}",
      distractors: [
        "\\text{Linear (order 1)}",
        "\\text{Cubic (order 3)}",
        "\\text{Superlinear (order 1.5)}"
      ],
      explanation: "For a simple root, the error satisfies e_{n+1} ≈ C·e_n², giving quadratic convergence."
    }
  ];
  const c = pick(cases);
  return { ...c, difficulty: "hard", topic: "Numerical Methods" };
}

// ── Differential geometry / vector calculus ───────────────────────────────────
function tpl_vector_calculus() {
  const cases = [
    {
      question: "\\text{Evaluate } \\iint_S \\mathbf{F}\\cdot d\\mathbf{S} \\text{ using Divergence Theorem for } \\mathbf{F}=\\langle x,y,z\\rangle \\text{ over unit sphere}",
      correct_answer: "4\\pi",
      distractors: ["2\\pi", "\\dfrac{4\\pi}{3}", "12\\pi"],
      explanation: "div F = 3. ∭ 3 dV = 3·(4π/3)·1³ = 4π."
    },
    {
      question: "\\text{By Green's theorem, } \\oint_C (y^2\\,dx + x^2\\,dy) \\text{ over the unit square}",
      correct_answer: "0",
      distractors: ["1", "-1", "2"],
      explanation: "Green's: ∬(∂Q/∂x - ∂P/∂y)dA = ∬(2x-2y)dA. Over [0,1]²: ∫₀¹∫₀¹(2x-2y)dx dy = 0."
    },
    {
      question: "\\text{The arc length of } \\mathbf{r}(t)=\\langle \\cos t, \\sin t, t\\rangle \\text{ for } t\\in[0,2\\pi]",
      correct_answer: "2\\pi\\sqrt{2}",
      distractors: ["2\\pi", "4\\pi", "\\pi\\sqrt{2}"],
      explanation: "|r'(t)| = |(-sin t, cos t, 1)| = √2. Arc length = √2·2π."
    }
  ];
  const c = pick(cases);
  return { ...c, difficulty: "hard", topic: "Multivariable Calculus" };
}

// ── Linear programming / optimization ────────────────────────────────────────
function tpl_optimization() {
  const cases = [
    {
      question: "\\text{Minimize } f(x,y)=x^2+y^2 \\text{ subject to } x+y=1 \\text{ (Lagrange multipliers)}",
      correct_answer: "\\dfrac{1}{2} \\text{ at } x=y=\\dfrac{1}{2}",
      distractors: [
        "1 \\text{ at } x=1, y=0",
        "\\dfrac{1}{4} \\text{ at } x=y=\\dfrac{1}{2}",
        "0"
      ],
      explanation: "∇f = λ∇g: (2x,2y)=λ(1,1). So x=y. With x+y=1: x=y=1/2, f=1/2."
    },
    {
      question: "\\text{Critical point type of } f(x,y)=x^2-y^2 \\text{ at } (0,0)",
      correct_answer: "\\text{Saddle point}",
      distractors: [
        "\\text{Local minimum}",
        "\\text{Local maximum}",
        "\\text{Global minimum}"
      ],
      explanation: "f_{xx}=2, f_{yy}=-2, f_{xy}=0. D = f_{xx}f_{yy}-(f_{xy})² = -4 < 0 → saddle point."
    }
  ];
  const c = pick(cases);
  return { ...c, difficulty: "hard", topic: "Multivariable Calculus" };
}

// ── registry ──────────────────────────────────────────────────────────────────

const TEMPLATES = {
  easy: [
    tpl_linear_equation,
    tpl_quadratic_roots,
    tpl_slope_of_line,
    tpl_basic_derivative,
    tpl_simple_integral,
    tpl_trig_value,
  ],
  medium: [
    tpl_chain_rule,
    tpl_product_rule,
    tpl_definite_integral,
    tpl_limit_rational,
    tpl_log_solve,
    tpl_trig_identity,
    // NEW
    tpl_quotient_rule,
    tpl_series_convergence,
    tpl_inverse_trig_derivative,
    tpl_related_rates,
    tpl_complex_arithmetic,
    tpl_matrix_multiply,
    tpl_separable_ode,
    tpl_probability_basic,
  ],
  hard: [
    tpl_integration_by_parts,
    tpl_partial_fractions,
    tpl_implicit_differentiation,
    tpl_taylor_series,
    tpl_lhopital,
    tpl_eigenvalue,
    // NEW
    tpl_partial_derivative,
    tpl_double_integral,
    tpl_gradient,
    tpl_fourier_series,
    tpl_laplace,
    tpl_second_order_ode,
    tpl_determinant,
    tpl_diagonalization,
    tpl_group_theory,
    tpl_number_theory,
    tpl_real_analysis,
    tpl_combinatorics,
    tpl_topology,
    tpl_statistics,
    tpl_complex_analysis,
    tpl_numerical_methods,
    tpl_vector_calculus,
    tpl_optimization,
  ]
};

module.exports = { TEMPLATES, shuffle };