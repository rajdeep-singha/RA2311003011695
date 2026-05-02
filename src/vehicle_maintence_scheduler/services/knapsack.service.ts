import type { Vehicle } from "../types/scheduler.types.js";

 //0/1 Knapsack – maximise total Impact without exceeding capacity 
  //Time complexity:  O(n × W)  where n = number of vehicles, W = mechanic-hour budget
 //Space complexity: O(n × W)  for the DP table

export function solveKnapsack(vehicles: Vehicle[], capacity: number): Vehicle[] {
  const n = vehicles.length;

  // dp[i][w] = maximum impact achievable using first i vehicles with budget w
  const dp: number[][] = Array.from({ length: n + 1 }, () =>
    new Array<number>(capacity + 1).fill(0)
  );

  for (let i = 1; i <= n; i++) {
    const vehicle = vehicles[i - 1]!;

    for (let w = 0; w <= capacity; w++) {
      // Option A: skip this vehicle
      dp[i]![w] = dp[i - 1]![w]!;

      // Option B: include this vehicle (only if it fits)
      if (vehicle.Duration <= w) {
        const withVehicle =
          dp[i - 1]![w - vehicle.Duration]! + vehicle.Impact;

        if (withVehicle > dp[i]![w]!) {
          dp[i]![w] = withVehicle;
        }
      }
    }
  }

  // Backtrack through DP table to recover selected vehicles
  const selected: Vehicle[] = [];
  let remainingCapacity = capacity;

  for (let i = n; i > 0; i--) {
    if (dp[i]![remainingCapacity] !== dp[i - 1]![remainingCapacity]) {
      selected.push(vehicles[i - 1]!);
      remainingCapacity -= vehicles[i - 1]!.Duration;
    }
  }

  return selected;
}
