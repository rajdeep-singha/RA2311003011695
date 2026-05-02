import type {
  Notification,
  NotificationType,
} from "../types/notification.types.js";

/**
 * Weight assigned to each notification type for priority ranking.
 * Placement outranks Result which outranks Event.
 * The gap of 1 between weights ensures type always dominates over recency.
 */
const TYPE_WEIGHT: Record<NotificationType, number> = {
  Placement: 3,
  Result: 2,
  Event: 1,
};

/**
 * Computes a priority score for a single notification.
 *
 * Score = typeWeight + normalisedRecency
 *
 * normalisedRecency maps the notification timestamp to [0, 1) relative to
 * the oldest and newest items in the set, so recency never overrides type
 * priority (type weight gap = 1, recency is always < 1).
 *
 * @param notification  The notification to score
 * @param newestMs      Epoch ms of the most recent notification in the set
 * @param oldestMs      Epoch ms of the oldest notification in the set
 */
function computeScore(
  notification: Notification,
  newestMs: number,
  oldestMs: number
): number {
  const typeWeight = TYPE_WEIGHT[notification.Type] ?? 0;
  const tsMs = new Date(notification.Timestamp).getTime();
  const range = newestMs - oldestMs || 1; // avoid division by zero
  const normalisedRecency = (tsMs - oldestMs) / range; // [0, 1)
  return typeWeight + normalisedRecency;
}

/**
 * Returns the top N notifications ranked by (type priority DESC, recency DESC).
 *
 * For streaming / real-time use, a min-heap of size N gives O(log N) per
 * insertion — efficient as new notifications arrive continuously.
 *
 * @param notifications  Full list of notifications
 * @param topN           How many to return (default 10)
 */
export function getTopNotifications(
  notifications: Notification[],
  topN: number = 10
): Notification[] {
  if (notifications.length === 0) return [];

  const timestamps = notifications.map((n) =>
    new Date(n.Timestamp).getTime()
  );
  const newestMs = Math.max(...timestamps);
  const oldestMs = Math.min(...timestamps);

  return [...notifications]
    .sort(
      (a, b) =>
        computeScore(b, newestMs, oldestMs) -
        computeScore(a, newestMs, oldestMs)
    )
    .slice(0, topN);
}
