export interface Depot {
  ID: number;
  MechanicHours: number;
}

export interface Vehicle {
  TaskID: string;
  Duration: number;
  Impact: number;
}

export interface DepotSchedule {
  depotID: number;
  mechanicHoursBudget: number;
  selectedTasks: Vehicle[];
  totalDuration: number;
  totalImpact: number;
}

export interface DepotsApiResponse {
  depots: Depot[];
}

export interface VehiclesApiResponse {
  vehicles: Vehicle[];
}
