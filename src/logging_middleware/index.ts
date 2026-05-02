import express from "express";
import 'dotenv/config.js';
import { loggerMiddleware } from "./middleware/logger.middleware.js";

const app = express();
app.use(express.json());

app.use(loggerMiddleware);

app.get("/ping", (_req, res) => {
  res.json({ message: "pong" });
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

app.post("/echo", (req, res) => {
  res.json({ received: req.body });
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Logging middleware server running on http://localhost:${PORT}`);
});
