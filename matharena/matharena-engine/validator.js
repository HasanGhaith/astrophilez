// ─────────────────────────────────────────────────────────────────────────────
// validator.js  —  Pipeline validation stage
//
// Checks:
//   1. Required fields exist
//   2. Exactly 4 options
//   3. correct_index is 0-3
//   4. options[correct_index] is unique (answer not duplicated in options)
//   5. All options are unique strings
//   6. difficulty is one of easy | medium | hard
//   7. topic is a non-empty string
// ─────────────────────────────────────────────────────────────────────────────

const REQUIRED_FIELDS = ["question", "options", "correct_index", "difficulty", "topic"];
const VALID_DIFFICULTIES = ["easy", "medium", "hard"];

/**
 * Validate a single problem.
 * Returns { valid: boolean, errors: string[] }
 */
function validateProblem(problem) {
  const errors = [];

  // 1. Required fields
  for (const field of REQUIRED_FIELDS) {
    if (problem[field] === undefined || problem[field] === null) {
      errors.push(`Missing required field: "${field}"`);
    }
  }

  if (errors.length > 0) return { valid: false, errors };

  // 2. question is non-empty string
  if (typeof problem.question !== "string" || problem.question.trim() === "") {
    errors.push("question must be a non-empty string");
  }

  // 3. options is array of exactly 4
  if (!Array.isArray(problem.options)) {
    errors.push("options must be an array");
  } else {
    if (problem.options.length !== 4) {
      errors.push(`options must have exactly 4 items, found ${problem.options.length}`);
    }

    // 4. All options are non-empty strings
    problem.options.forEach((opt, i) => {
      if (typeof opt !== "string" || opt.trim() === "") {
        errors.push(`options[${i}] is not a valid string`);
      }
    });

    // 5. All options are unique
    const unique = new Set(problem.options.map(o => o.trim()));
    if (unique.size !== problem.options.length) {
      errors.push("options contains duplicate entries (answer must not appear twice)");
    }
  }

  // 6. correct_index is valid
  if (typeof problem.correct_index !== "number" ||
      !Number.isInteger(problem.correct_index) ||
      problem.correct_index < 0 ||
      problem.correct_index > 3) {
    errors.push("correct_index must be an integer 0–3");
  }

  // 7. difficulty
  if (!VALID_DIFFICULTIES.includes(problem.difficulty)) {
    errors.push(`difficulty must be one of: ${VALID_DIFFICULTIES.join(", ")}`);
  }

  // 8. topic
  if (typeof problem.topic !== "string" || problem.topic.trim() === "") {
    errors.push("topic must be a non-empty string");
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Strip internal fields (_raw, _verification, id) and return the clean
 * problem ready for problem-bank.json.
 */
function sanitizeProblem(problem) {
  const { _raw, _verification, id, _failReason, ...clean } = problem;
  return clean;
}

/**
 * Validate an array of problems.
 * Returns { passed: CleanProblem[], rejected: { problem, errors }[] }
 */
function validateAll(problems) {
  const passed = [];
  const rejected = [];

  for (const p of problems) {
    const { valid, errors } = validateProblem(p);
    if (valid) {
      passed.push(sanitizeProblem(p));
    } else {
      rejected.push({ problem: p, errors });
    }
  }

  return { passed, rejected };
}

module.exports = { validateProblem, validateAll, sanitizeProblem };