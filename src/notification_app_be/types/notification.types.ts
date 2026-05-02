export type NotificationType = "Placement" | "Result" | "Event";

export interface Notification {
  ID: string;
  Type: NotificationType;
  Message: string;
  Timestamp: string;
}

export interface NotificationsApiResponse {
  notifications: Notification[];
}

export interface PriorityInboxResponse {
  topNotifications: Notification[];
  count: number;
  scoringStrategy: string;
}
