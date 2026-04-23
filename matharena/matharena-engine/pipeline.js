// ─────────────────────────────────────────────────────────────────────────────
// pipeline.js  —  Math Arena problem generation pipeline
//
// Usage:
//   node pipeline.js [--count 50] [--difficulty mixed|easy|medium|hard]
//                    [--output problem-bank.json] [--append]
//
// Stages:
//   GENERATE → SOLVE/VERIFY → VALIDATE → WRITE
// ─────────────────────────────────────────────────────────────────────────────

const fs   = require("fs");
const path = require("path");

const { generateProblems } = require("./generator");
const { solveAndVerify }   = require("./solver");
const { validateAll }      = require("./validator");

// ── CLI arg parsing ───────────────────────────────────────────────────────────
const args = process.argv.slice(2);
function getArg(name, def) {
  const idx = args.indexOf(`--${name}`);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : def;
}
const COUNT      = parseInt(getArg("count", "30"), 10);
const DIFFICULTY = getArg("difficulty", "mixed");
const OUTPUT     = getArg("output", "problem-bank.json");
const APPEND     = args.includes("--append");
const VERBOSE    = args.includes("--verbose");

// ── Color helpers (no deps) ───────────────────────────────────────────────────
const c = {
  reset:  "\x1b[0m",
  bold:   "\x1b[1m",
  green:  "\x1b[32m",
  red:    "\x1b[31m",
  yellow: "\x1b[33m",
  cyan:   "\x1b[36m",
  gray:   "\x1b[90m",
};
const log = (color, ...msg) => console.log(color + msg.join(" ") + c.reset);

// ── Pipeline ──────────────────────────────────────────────────────────────────
function run() {
  console.log("\n" + c.bold + "━━━ Math Arena Problem Pipeline ━━━" + c.reset);

  // ── Stage 1: GENERATE ──────────────────────────────────────────────────────
  log(c.cyan, `\n[1/4] Generating ${COUNT} problems (difficulty: ${DIFFICULTY})...`);
  const raw = generateProblems({ count: COUNT, difficulty: DIFFICULTY });
  log(c.green, `      ✓ Generated ${raw.length} raw problems`);

  // ── Stage 2: SOLVE / VERIFY ────────────────────────────────────────────────
  log(c.cyan, "\n[2/4] Running solver & double-checking answers...");
  const { verified, failed: solverFailed } = solveAndVerify(raw);

  log(c.green,  `      ✓ Solver passed:  ${verified.length}`);
  if (solverFailed.length > 0) {
    log(c.red, `      ✗ Solver failed:  ${solverFailed.length}`);
    if (VERBOSE) {
      solverFailed.forEach(p => {
        console.log(`        [${p.topic}] ${p.question.slice(0, 60)}`);
        console.log(`           → ${p._failReason}`);
      });
    }
  }

  const verificationSummary = {
    high: verified.filter(p => p._verification?.confidence === "high").length,
    medium: verified.filter(p => p._verification?.confidence === "medium").length,
  };
  log(c.gray, `      Confidence — numeric: ${verificationSummary.high}, symbolic: ${verificationSummary.medium}`);

  // ── Stage 3: VALIDATE ──────────────────────────────────────────────────────
  log(c.cyan, "\n[3/4] Validating JSON format & structure...");
  const { passed, rejected } = validateAll(verified);

  log(c.green,  `      ✓ Validation passed: ${passed.length}`);
  if (rejected.length > 0) {
    log(c.red, `      ✗ Validation failed: ${rejected.length}`);
    if (VERBOSE) {
      rejected.forEach(({ problem, errors }) => {
        console.log(`        [${problem.topic}] ${String(problem.question).slice(0, 60)}`);
        errors.forEach(e => console.log(`           → ${e}`));
      });
    }
  }

  if (passed.length === 0) {
    log(c.red, "\n✗ No problems passed all stages. Nothing written.");
    process.exit(1);
  }

  // ── Stage 4: WRITE ─────────────────────────────────────────────────────────
  log(c.cyan, `\n[4/4] Writing to ${OUTPUT}...`);
  const outputPath = path.resolve(OUTPUT);
  let bank = [];

  if (APPEND && fs.existsSync(outputPath)) {
    try {
      bank = JSON.parse(fs.readFileSync(outputPath, "utf8"));
      if (!Array.isArray(bank)) bank = [];
      log(c.gray, `      Loaded ${bank.length} existing problems`);
    } catch {
      log(c.yellow, "      Warning: could not parse existing file, starting fresh");
      bank = [];
    }
  }

  bank.push(...passed);
  fs.writeFileSync(outputPath, JSON.stringify(bank, null, 2), "utf8");
  log(c.green, `      ✓ Wrote ${bank.length} total problems to ${OUTPUT}`);

  // ── Summary ────────────────────────────────────────────────────────────────
  const byDiff = { easy: 0, medium: 0, hard: 0 };
  const byTopic = {};
  for (const p of passed) {
    byDiff[p.difficulty] = (byDiff[p.difficulty] || 0) + 1;
    byTopic[p.topic] = (byTopic[p.topic] || 0) + 1;
  }

  console.log("\n" + c.bold + "━━━ Summary ━━━" + c.reset);
  console.log(`  Generated : ${raw.length}`);
  console.log(`  Solver OK : ${verified.length}  (dropped ${solverFailed.length})`);
  console.log(`  Valid     : ${passed.length}  (dropped ${rejected.length})`);
  console.log(`  Written   : ${passed.length} new problems → ${OUTPUT}`);
  console.log(`\n  By difficulty:`);
  Object.entries(byDiff).forEach(([d, n]) => console.log(`    ${d.padEnd(8)}: ${n}`));
  console.log(`\n  By topic:`);
  Object.entries(byTopic).sort((a,b) => b[1]-a[1]).forEach(([t, n]) =>
    console.log(`    ${t.padEnd(18)}: ${n}`)
  );
  console.log("");

  return { passed, solverFailed, rejected };
}

run();


// npm install mathjs uuid

// # Generate 50 mixed problems
// node pipeline.js --count 50

// # Generate 100 hard-only, append to existing bank
// node pipeline.js --count 100 --difficulty hard --append

// # See exactly what got rejected and why
// node pipeline.js --count 30 --verbose


// cd C:\Users\A\Desktop\astronode\matharena\matharena-engine