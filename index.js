// index.js
import express from "express";
import fetch from "node-fetch";

const app = express();

// ----------------------
// Environment variables (set these in Render)
// ----------------------
const TOKEN = process.env.JWT_TOKEN;           // StreamElements JWT token
const CHANNEL_ID = process.env.SE_CHANNEL_ID;  // Your StreamElements channel ID
const API_KEY = process.env.API_KEY;           // Simple security key for requests

// ----------------------
// In-memory duel storage
// ----------------------
const duels = new Map();

// ----------------------
// Helper functions
// ----------------------

// Get user points from StreamElements
async function getPoints(username) {
  try {
    const res = await fetch(`https://api.streamelements.com/kappa/v2/points/${CHANNEL_ID}/${encodeURIComponent(username)}`, {
      headers: { Authorization: `Bearer ${TOKEN}` }
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.points ?? 0;
  } catch (err) {
    console.error("getPoints error:", err);
    return null;
  }
}

// Add/subtract points for a user
async function addPoints(username, amount) {
  try {
    await fetch(`https://api.streamelements.com/kappa/v2/points/${CHANNEL_ID}/${encodeURIComponent(username)}/add`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TOKEN}`
      },
      body: JSON.stringify({ amount })
    });
  } catch (err) {
    console.error("addPoints error:", err);
  }
}

// Generate random Wild West victory message
function getVictoryMessage(winner, loser, bet) {
  const messages = [
    `🤠 🔫 Hold onto your hats! ${winner} draws faster than a rattlesnake and snags ${bet} points from ${loser}! 🌵🏜️`,
    `💥 Bang! ${winner} outdraws ${loser} and pockets ${bet} points! 🍺🤠`,
    `🏜️ Quick on the draw! ${winner} robs ${loser} of ${bet} points and rides into the sunset! 🌅🐎`,
    `🤠 Steady hands win! ${winner} snatches ${bet} points from ${loser} faster than a tumbleweed in a twister! 🌪️`,
    `🔫 Ka-BAM! ${winner} draws first and claims ${bet} points! ${loser} better watch out next time at high noon! 🕛`
  ];
  return messages[Math.floor(Math.random() * messages.length)];
}

// ----------------------
// Middleware: API Key Check
// ----------------------
function requireApiKey(req, res, next) {
  if (req.query.key !== API_KEY) {
    return res.status(403).json({ type: "message", message: "🚫 Unauthorized request." });
  }
  next();
}

// ----------------------
// Cleanup expired duels every 10 seconds
// ----------------------
setInterval(() => {
  const now = Date.now();
  for (const [key, duel] of duels.entries()) {
    if (duel.expires < now) duels.delete(key);
  }
}, 10000);

// ----------------------
// Endpoints
// ----------------------

// Health check
app.get("/", (req, res) => res.send("Quickdraw server running."));

// Challenge another user
app.get("/quickdraw", requireApiKey, async (req, res) => {
  const challenger = (req.query.challenger || "").replace("@", "").trim();
  const opponent = (req.query.opponent || "").replace("@", "").trim();
  const bet = parseInt(req.query.bet, 10);

  if (!challenger || !opponent || isNaN(bet) || bet <= 0) {
    return res.json({ type: "message", message: "⚠️ Usage: !quickdraw @username [points]" });
  }

  if (challenger.toLowerCase() === opponent.toLowerCase()) {
    return res.json({ type: "message", message: "⚠️ You can't challenge yourself, partner." });
  }

  // Store duel for 30 seconds
  duels.set(opponent.toLowerCase(), { challenger, bet, expires: Date.now() + 30000 });

  const challengerPoints = await getPoints(challenger) ?? 0;

  res.json({
    type: "message",
    message: `🤠 ${challenger} challenges ${opponent} to a ${bet}-point quickdraw! @${challenger} has ${challengerPoints} points. ${opponent}, type !tango ${challenger} within 30s to accept.`
  });
});

// Accept a duel (!tango)
app.get("/tango", requireApiKey, async (req, res) => {
  const opponent = (req.query.opponent || "").replace("@", "").trim();
  const challenger = (req.query.challenger || "").replace("@", "").trim();

  if (!opponent || !challenger) {
    return res.json({ type: "message", message: "⚠️ Usage: !tango [challengerName]" });
  }

  const duel = duels.get(opponent.toLowerCase());
  if (!duel || duel.challenger.toLowerCase() !== challenger.toLowerCase()) {
    return res.json({ type: "message", message: "⚠️ No active duel found between those two users." });
  }

  if (Date.now() > duel.expires) {
    duels.delete(opponent.toLowerCase());
    return res.json({ type: "message", message: "⏰ Duel expired." });
  }

  // Remove duel from memory
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

  const winnerPoints = await getPoints(winner) ?? 0;
  const victoryMessage = getVictoryMessage(winner, loser, bet);

  res.json({
    type: "message",
    message: `${victoryMessage} Now @${winner} has ${winnerPoints} points!`
  });
});

// ----------------------
// Start server
// ----------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Quickdraw Duel server running on port ${PORT}`));
