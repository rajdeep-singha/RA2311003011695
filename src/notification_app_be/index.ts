import 'dotenv/config.js';
import express from "express";
import notificationRouter from "./routes/notification.routes.js";

const app = express();
app.use(express.json());

// Routes
app.use("/notifications", notificationRouter);

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "campus-notification-app" });
});

const PORT = 3002;
app.listen(PORT, () => {
  console.log(`Campus Notification App running on http://localhost:${PORT}`);
  console.log(`  GET /notifications/priority?n=10  → top N by priority`);
  console.log(`  GET /notifications/all            → all notifications`);
});
