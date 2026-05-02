import express from "express";
import scheduleRouter from "./routes/schedule.routes.js";

const app = express();
app.use(express.json());

// Routes
app.use("/schedule", scheduleRouter);

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "vehicle-maintenance-scheduler" });
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(
    `Vehicle Maintenance Scheduler running on http://localhost:${PORT}`
  );
  console.log(`  GET /schedule          → all depots`);
  console.log(`  GET /schedule/:depotId → single depot`);
});
