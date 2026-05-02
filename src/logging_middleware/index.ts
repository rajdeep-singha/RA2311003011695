import express from "express";
import 'dotenv/config.js';
import { loggerMiddleware } from "./middleware/logger.middleware.js";

const app = express();
app.use(express.json());

// Apply logging middleware globally
app.use(loggerMiddleware);

// Health check
app.get("/ping", (_req, res) => {
  res.json({ message: "pong" });
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

// Echo route for testing request body logging
app.post("/echo", (req, res) => {
  res.json({ received: req.body });
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Logging middleware server running on http://localhost:${PORT}`);
});
