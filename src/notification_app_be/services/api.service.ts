import type { NotificationsApiResponse } from "../types/notification.types.js";

const BASE_URL = "http://20.207.122.201/evaluation-service";


function getAuthHeaders(): Record<string, string> {
  const token = process.env["API_TOKEN"] ?? "";
  if (!token) {
    console.warn("⚠️  API_TOKEN is not set in environment variables!");
  } else {
    console.log("✓ API_TOKEN loaded:", token.substring(0, 20) + "...");
  }
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

// all notifications
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
