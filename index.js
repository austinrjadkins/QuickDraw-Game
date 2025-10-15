// /quickdraw endpoint: challenge another user
app.get("/quickdraw", async (req, res) => {
  const challenger = (req.query.challenger || "").replace("@", "").trim();
  const opponent = (req.query.opponent || "").replace("@", "").trim();
  const bet = parseInt(req.query.bet, 10);

  // Validate input
  if (!challenger || !opponent || isNaN(bet) || bet <= 0) {
    return res.json({
      type: "message",
      message: "⚠️ Usage: !quickdraw @username [points]"
    });
  }

  if (challenger.toLowerCase() === opponent.toLowerCase()) {
    return res.json({
      type: "message",
      message: "⚠️ You can't challenge yourself, partner."
    });
  }

  // Store duel
  duels.set(opponent.toLowerCase(), {
    challenger,
    bet,
    expires: Date.now() + 30000 // 30 seconds
  });

  // Fetch challenger points
  const challengerPoints = await getPoints(challenger) ?? 0;

  res.json({
    type: "message",
    message: `🤠 ${challenger} challenges ${opponent} to a ${bet}-point quickdraw! @${challenger} has ${challengerPoints} points. ${opponent}, type !accept ${challenger} within 30s to accept.`
  });
});

// /accept endpoint: accept a duel
app.get("/accept", async (req, res) => {
  const opponent = (req.query.opponent || "").replace("@", "").trim();
  const challenger = (req.query.challenger || "").replace("@", "").trim();

  if (!opponent || !challenger) {
    return res.json({
      type: "message",
      message: "⚠️ Usage: !accept [challengerName]"
    });
  }

  const duel = duels.get(opponent.toLowerCase());
  if (!duel || duel.challenger.toLowerCase() !== challenger.toLowerCase()) {
    return res.json({
      type: "message",
      message: "No active duel found between those two users."
    });
  }

  if (Date.now() > duel.expires) {
    duels.delete(opponent.toLowerCase());
    return res.json({ type: "message", message: "⏰ Duel expired." });
  }

  // Remove duel (one-time)
  duels.delete(opponent.toLowerCase());
  const bet = duel.bet;

  // Check balances
  const cBal = await getPoints(challenger);
  const oBal = await getPoints(opponent);

  if (cBal === null || oBal === null) {
    return res.json({ type: "message", message: "⚠️ Error checking balances. Try again later." });
  }
  if (cBal < bet) return res.json({ type: "message", message: `🚫 ${challenger} doesn't have enough points.` });
  if (oBal < bet) return res.json({ type: "message", message: `🚫 ${opponent} doesn't have enough points.` });

  // Decide winner
  const winner = Math.random() < 0.5 ? challenger : opponent;
  const loser = winner === challenger ? opponent : challenger;

  // Transfer points
  await addPoints(loser, -bet);
  await addPoints(winner, bet);

  // Fetch winner’s updated points
  const winnerPoints = await getPoints(winner) ?? 0;

  // Send victory message
  const messages = [
    `🤠 🔫 Hold onto your hats! ${winner} draws faster than a rattlesnake and snags ${bet} points from ${loser}! 🌵🏜️`,
    `💥 Bang! ${winner} outdraws ${loser} and pockets ${bet} points! 🍺🤠`,
    `🏜️ Quick on the draw! ${winner} robs ${loser} of ${bet} points and rides into the sunset! 🌅🐎`,
    `🤠 Steady hands win! ${winner} snatches ${bet} points from ${loser} faster than a tumbleweed in a twister! 🌪️`,
    `🔫 Ka-BAM! ${winner} draws first and claims ${bet} points! ${loser} better watch out next time at high noon! 🕛`
  ];

  const victoryMessage = messages[Math.floor(Math.random() * messages.length)];

  res.json({
    type: "message",
    message: `${victoryMessage} Now @${winner} has ${winnerPoints} points!`
  });
});
