import type {
  Notification,
  NotificationType,
} from "../types/notification.types.js";


const TYPE_WEIGHT: Record<NotificationType, number> = {
  Placement: 3,
  Result: 2,
  Event: 1,
};

// Computes a priority score for a single notification.

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
