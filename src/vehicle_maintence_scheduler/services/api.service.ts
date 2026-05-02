import type {
  DepotsApiResponse,
  VehiclesApiResponse,
} from "../types/scheduler.types.js";

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

async function fetchJSON<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: getAuthHeaders(),
  });

  if (!res.ok) {
    throw new Error(
      `Upstream API error: ${res.status} ${res.statusText} for ${path}`
    );
  }

  return res.json() as Promise<T>;
}

export async function fetchDepots(): Promise<DepotsApiResponse> {
  return fetchJSON<DepotsApiResponse>("/depots");
}

export async function fetchVehicles(): Promise<VehiclesApiResponse> {
  return fetchJSON<VehiclesApiResponse>("/vehicles");
}
