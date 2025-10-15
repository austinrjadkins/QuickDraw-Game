// index.js
import express from "express";
import fetch from "node-fetch";

const app = express();

// Environment variables
// Set these in Render: JWT_TOKEN, SE_CHANNEL_ID
const TOKEN = process.env.JWT_TOKEN;       
const CHANNEL_ID = process.env.SE_CHANNEL_ID; 

// In-memory pending duels
const duels = new Map();

// Helper: get user points
async function getPoints(username) {
  try {
    const res = await fetch(`https://api.streamelements.com/kappa/v2/points/${CHANNEL_ID}/${encodeURIComponent(username)}`, {
      headers: { Authorization: `Bearer ${TOKEN}` }
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.points ?? 0;
  } catch (e) {
    console.error("getPoints error", e);
    return null;
  }
}

// Helper: add/subtract points
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
  } catch (e) {
    console.error("addPoints error", e);
  }
}

// Random Wild West victory messages
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

// /quickdraw endpoint: challenge another user
app.get("/quickdraw", (req, res) => {
  const challenger = (req.query.challenger || "").replace("@", "").trim();
  const opponent = (req.query.opponent || "").replace("@", "").trim();
  const bet = parseInt(req.query.bet, 10);

  if (!challenger || !opponent || isNaN(bet) || bet <= 0) {
    return res.send("⚠️ Usage: !quickdraw @username [points]");
  }

  if (challenger.toLowerCase() === opponent.toLowerCase()) {
    return res.send("⚠️ You can't challenge yourself, partner.");
  }

  duels.set(opponent.toLowerCase(), {
    challenger,
    bet,
    expires: Date.now() + 30000 // 30 seconds to accept
  });

  return res.send(`🤠 ${challenger} challenges ${opponent} to a ${bet}-point quickdraw! ${opponent}, type !accept ${challenger} within 30s to accept.`);
});

// /accept endpoint: accept a duel
app.get("/accept", async (req, res) => {
  const opponent = (req.query.opponent || "").replace("@", "").trim();
  const challenger = (req.query.challenger || "").replace("@", "").trim();

  if (!opponent || !challenger) return res.send("⚠️ Usage: !accept [challengerName]");

  const duel = duels.get(opponent.toLowerCase());
  if (!duel || duel.challenger.toLowerCase() !== challenger.toLowerCase()) {
    return res.send("No active duel found between those two users.");
  }

  if (Date.now() > duel.expires) {
    duels.delete(opponent.toLowerCase());
    return res.send("⏰ Duel expired.");
  }

  duels.delete(opponent.toLowerCase());
  const bet = duel.bet;

  const cBal = await getPoints(challenger);
  const oBal = await getPoints(opponent);

  if (cBal === null || oBal === null) return res.send("⚠️ Error checking balances. Try again later.");
  if (cBal < bet) return res.send(`🚫 ${challenger} doesn't have enough points.`);
  if (oBal < bet) return res.send(`🚫 ${opponent} doesn't have enough points.`);

  // decide winner
  const winner = Math.random() < 0.5 ? challenger : opponent;
  const loser = winner === challenger ? opponent : challenger;

  // transfer points
  await addPoints(loser, -bet);
  await addPoints(winner, bet);

  // send victory message
  return res.send(getVictoryMessage(winner, loser, bet));
});

// Health check
app.get("/", (req, res) => res.send("Quickdraw server running."));

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Quickdraw Duel server running on port ${PORT}`));
