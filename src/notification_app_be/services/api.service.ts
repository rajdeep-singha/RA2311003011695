import type { NotificationsApiResponse } from "../types/notification.types.js";

const BASE_URL = "http://20.207.122.201/evaluation-service";

/**
 * Returns authorization headers using the API_TOKEN environment variable.
 * Set API_TOKEN=<your-token> before starting the server.
 */
function getAuthHeaders(): Record<string, string> {
  const token = process.env["API_TOKEN"] ?? "";
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

/**
 * Fetches all notifications from the upstream evaluation API.
 */
export async function fetchNotifications(): Promise<NotificationsApiResponse> {
  const res = await fetch(`${BASE_URL}/notifications`, {
    headers: getAuthHeaders(),
  });

  if (!res.ok) {
    throw new Error(
      `Upstream API error: ${res.status} ${res.statusText}`
    );
  }

  return res.json() as Promise<NotificationsApiResponse>;
}
