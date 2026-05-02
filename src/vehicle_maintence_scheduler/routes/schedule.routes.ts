import { Router, type Request, type Response } from "express";
import { fetchDepots, fetchVehicles } from "../services/api.service.js";
import { solveKnapsack } from "../services/knapsack.service.js";
import type { DepotSchedule } from "../types/scheduler.types.js";

const router = Router();

/**
 * GET /schedule
 * Returns the optimal maintenance schedule for every depot.
 * Depots and vehicles are fetched from the upstream evaluation API.
 */
router.get("/", async (_req: Request, res: Response) => {
  try {
    const [{ depots }, { vehicles }] = await Promise.all([
      fetchDepots(),
      fetchVehicles(),
    ]);

    const schedules: DepotSchedule[] = depots.map((depot) => {
      const selectedTasks = solveKnapsack(vehicles, depot.MechanicHours);
      return {
        depotID: depot.ID,
        mechanicHoursBudget: depot.MechanicHours,
        selectedTasks,
        totalDuration: selectedTasks.reduce((sum, v) => sum + v.Duration, 0),
        totalImpact: selectedTasks.reduce((sum, v) => sum + v.Impact, 0),
      };
    });

    res.json({ schedules });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    res.status(500).json({ error: message });
  }
});

/**
 * GET /schedule/:depotId
 * Returns the optimal maintenance schedule for a single depot.
 */
router.get("/:depotId", async (req: Request, res: Response) => {
  try {
    const depotId = Number(req.params["depotId"]);

    if (isNaN(depotId)) {
      res.status(400).json({ error: "depotId must be a valid number" });
      return;
    }

    const [{ depots }, { vehicles }] = await Promise.all([
      fetchDepots(),
      fetchVehicles(),
    ]);

    const depot = depots.find((d) => d.ID === depotId);
    if (!depot) {
      res.status(404).json({ error: `Depot with ID ${depotId} not found` });
      return;
    }

    const selectedTasks = solveKnapsack(vehicles, depot.MechanicHours);
    const schedule: DepotSchedule = {
      depotID: depot.ID,
      mechanicHoursBudget: depot.MechanicHours,
      selectedTasks,
      totalDuration: selectedTasks.reduce((sum, v) => sum + v.Duration, 0),
      totalImpact: selectedTasks.reduce((sum, v) => sum + v.Impact, 0),
    };

    res.json(schedule);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    res.status(500).json({ error: message });
  }
});

export default router;
