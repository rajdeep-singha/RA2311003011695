import { Router, type Request, type Response } from "express";
import { fetchNotifications } from "../services/api.service.js";
import { getTopNotifications } from "../services/priority.service.js";
import type { PriorityInboxResponse } from "../types/notification.types.js";

const router = Router();

/**
 * GET /notifications/priority?n=10
 * Returns the top N notifications ranked by type priority (Placement > Result > Event)
 * and recency. Defaults to top 10.
 */
router.get("/priority", async (req: Request, res: Response) => {
  try {
    const topN = Math.max(1, Number(req.query["n"]) || 10);

    const { notifications } = await fetchNotifications();
    const topNotifications = getTopNotifications(notifications, topN);

    const response: PriorityInboxResponse = {
      topNotifications,
      count: topNotifications.length,
      scoringStrategy:
        "type-priority (Placement > Result > Event) + normalised recency",
    };

    res.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    res.status(500).json({ error: message });
  }
});

/**
 * GET /notifications/all
 * Proxies the full notification list from the upstream API.
 */
router.get("/all", async (_req: Request, res: Response) => {
  try {
    const { notifications } = await fetchNotifications();
    res.json({ notifications, total: notifications.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    res.status(500).json({ error: message });
  }
});

export default router;
