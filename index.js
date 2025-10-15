// index.js
import express from "express";
import fetch from "node-fetch";

const app = express();

// 🟢 EDIT: These come from environment variables. Set them in Render/Replit Secrets.
// Do NOT hardcode tokens in this file when you deploy publicly.
const TOKEN = process.env.JWT_TOKEN;       // <-- StreamElements JWT (store as secret)
const CHANNEL_ID = process.env.SE_CHANNEL_ID; // <-- StreamElements Channel ID

// in-memory pending duels (simple Map). For a production bot use Redis or DB.
const duels = new Map();

async function getPoints(username) {
  // returns integer points or null on error
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

async function addPoints(username, amount) {
  // amount can be negative to subtract
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

// quickdraw: challenger issues challenge to opponent
app.get("/quickdraw", (req, res) => {
  const challenger = (req.query.challenger || "").replace("@", "").trim();
  const opponent = (req.query.opponent || "").replace("@", "").trim();
  const bet = parseInt(req.query.bet, 10);

  if (!challenger || !opponent || isNaN(bet) || bet <= 0) {
    return res.send("⚠️ Usage: !quickdraw @username [points]");
  }

  // prevent self-challenge
  if (challenger.toLowerCase() === opponent.toLowerCase()) {
    return res.send("⚠️ You can't challenge yourself, partner.");
  }

  // store pending duel keyed by opponent so the opponent can accept
  duels.set(opponent.toLowerCase(), {
    challenger,
    bet,
    expires: Date.now() + 30000 // 30 seconds to accept
  });

  return res.send(`🤠 ${challenger} challenges ${opponent} to a ${bet}-point quickdraw! ${opponent}, type !accept ${challenger} within 30s to accept.`);
});

// accept endpoint: opponent accepts a previously created duel
app.get("/accept", async (req, res) => {
  const opponent = (req.query.opponent || "").replace("@", "").trim(); // this is the user typing !accept (should match map key)
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

  // remove duel (one-time)
  duels.delete(opponent.toLowerCase());
  const bet = duel.bet;

  // check balances
  const cBal = await getPoints(challenger);
  const oBal = await getPoints(opponent);

  if (cBal === null || oBal === null) return res.send("⚠️ Error checking balances. Try again later.");
  if (cBal < bet) return res.send(`🚫 ${challenger} doesn't have enough points.`);
  if (oBal < bet) return res.send(`🚫 ${opponent} doesn't have enough points.`);

  // decide winner
  const winner = Math.random() < 0.5 ? challenger : opponent;
  const loser = winner === challenger ? opponent : challenger;

  // transfer points: subtract bet from loser, add bet to winner
  // (net effect: winner +bet, loser -bet)
  await addPoints(loser, -bet);
  await addPoints(winner, bet);

  return res.send(`💥 ${winner} draws first and wins ${bet} points from ${loser}!`);
});

// simple health check
app.get("/", (req, res) => res.send("Quickdraw server running."));

// Start the server (use PORT from env if provided)
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Quickdraw Duel server running on port ${PORT}`);
});
