// ─────────────────────────────────────────────────────────────────────────────
// generator.js  —  Generates raw problems from templates
// ─────────────────────────────────────────────────────────────────────────────

const { v4: uuidv4 } = require("uuid");
const { TEMPLATES, shuffle } = require("./templates");

/**
 * Generate `count` problems.
 * @param {object} opts
 * @param {number} opts.count          Total problems to generate
 * @param {string} [opts.difficulty]   'easy'|'medium'|'hard'|'mixed' (default 'mixed')
 * @returns {object[]}  Raw problem objects (not yet in final JSON format)
 */
function generateProblems({ count = 10, difficulty = "mixed" } = {}) {
  const problems = [];

  for (let i = 0; i < count; i++) {
    let diff;
    if (difficulty === "mixed") {
      diff = ["easy", "medium", "hard"][i % 3];
    } else {
      diff = difficulty;
    }

    const pool = TEMPLATES[diff];
    if (!pool || pool.length === 0) {
      console.warn(`No templates for difficulty: ${diff}`);
      continue;
    }

    // Pick a random template from the pool
    const tpl = pool[Math.floor(Math.random() * pool.length)];
    let raw;

    try {
      raw = tpl();
    } catch (err) {
      console.warn(`Template error: ${err.message}`);
      continue;
    }

    // Build the 4-option array: shuffle correct + 3 distractors
    const options = shuffle([raw.correct_answer, ...raw.distractors.slice(0, 3)]);
    const correct_index = options.indexOf(raw.correct_answer);

    problems.push({
      id: uuidv4(),
      question: raw.question,
      options,
      correct_index,
      difficulty: raw.difficulty,
      topic: raw.topic,
      explanation: raw.explanation || "",
      _raw: raw  // retained for solver double-check, stripped before output
    });
  }

  return problems;
}

module.exports = { generateProblems };