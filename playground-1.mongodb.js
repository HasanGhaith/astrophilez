use("astrophiles_auth");

// Reset every user to 800 Elo and remove all legacy point fields
db.users.updateMany(
  {},
  {
    $set: {
      solver_rating: 800,
      creator_score: 0,
      current_streak: 0,
      total_solves: 0,
    },
    $unset: {
      elo:            "",
      solver_points:  "",
      solver_score:   "",
      creator_points: "",
    }
  }
);

// Verify
db.users.findOne({ username: "hasan_ghaith_" });