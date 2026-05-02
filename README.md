# Backend Microservices

A TypeScript + Express monorepo containing three production-grade microservices built to production standards with proper folder structure, typed interfaces, and layered architecture.

---

## Table of Contents

- [Project Structure](#project-structure)
- [Setup & Installation](#setup--installation)
- [1. Logging Middleware](#1-logging-middleware)
  - [Server Startup](#server-startup)
- [2. Vehicle Maintenance Scheduler](#2-vehicle-maintenance-scheduler)
  - [Server Startup](#server-startup-1)
  - [GET /schedule — All Depots](#get-schedule--all-depots)
- [3. Campus Notification App](#3-campus-notification-app)
  - [Server Startup](#server-startup-2)
  - [GET /notifications/priority — Priority Inbox](#get-notificationspriority--priority-inbox)
  - [GET /notifications/all — All Notifications](#get-notificationsall--all-notifications)

---

## Project Structure

```
src/
├── logging_middleware/
│   ├── middleware/
│   │   └── logger.middleware.ts   ← colour-coded HTTP logger
│   └── index.ts                   ← Express app (port 3000)
│
├── vehicle_maintence_scheduler/
│   ├── types/
│   │   └── scheduler.types.ts     ← Depot, Vehicle, DepotSchedule interfaces
│   ├── services/
│   │   ├── api.service.ts         ← fetchDepots(), fetchVehicles()
│   │   └── knapsack.service.ts    ← O(n×W) 0/1 knapsack DP
│   ├── routes/
│   │   └── schedule.routes.ts     ← GET /schedule, GET /schedule/:depotId
│   └── index.ts                   ← Express app (port 3001)
│
└── notification_app_be/
    ├── types/
    │   └── notification.types.ts  ← Notification, PriorityInboxResponse
    ├── services/
    │   ├── api.service.ts         ← fetchNotifications()
    │   └── priority.service.ts    ← getTopNotifications() scoring
    ├── routes/
    │   └── notification.routes.ts ← GET /notifications/priority, /all
    └── index.ts                   ← Express app (port 3002)
```

---

## Setup & Installation

```bash
# Install dependencies
npm install

# Create .env from template
cp .env.example .env
# Add your API_TOKEN to .env
```

---

## 1. Logging Middleware

An Express middleware that intercepts every HTTP request and logs the method, URL, status code, and response time with colour-coded output (green 2xx, yellow 3xx, red 4xx/5xx).

**Port:** `3000`

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/ping` | GET | Health check — returns `pong` |
| `/health` | GET | Returns server uptime |
| `/echo` | POST | Echoes request body |

### Server Startup

<img width="513" height="126" alt="Logging middleware server starting on port 3000" src="https://github.com/user-attachments/assets/4d4a323a-86d2-4ed2-ba8e-7280eadf70cd" />

```bash
npm run logging
```

---

## 2. Vehicle Maintenance Scheduler

Solves the vehicle maintenance scheduling problem as a **0/1 Knapsack** (dynamic programming, O(n × W)). Fetches depot budgets and vehicle tasks from the upstream evaluation API, then computes the optimal subset of tasks that maximises total operational impact within each depot's mechanic-hour budget.

**Port:** `3001`

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/schedule` | GET | Optimal schedule for all depots |
| `/schedule/:depotId` | GET | Optimal schedule for a single depot |
| `/health` | GET | Service health check |

### Server Startup

<img width="957" height="753" alt="Vehicle maintenance scheduler server starting on port 3001" src="https://github.com/user-attachments/assets/3935a673-ebb9-4cd8-90e5-7f6e1f02805d" />

```bash
npm run scheduler
```

### GET /schedule — All Depots

Returns the knapsack-optimised maintenance schedule for every depot, showing selected tasks, total duration used, and total impact score achieved.

<img width="956" height="830" alt="GET /schedule response showing optimised depot schedules with impact scores" src="https://github.com/user-attachments/assets/a431a203-80bd-4e64-9da8-99fc3a1aed7c" />

---

## 3. Campus Notification App

Fetches campus notifications (Placements, Results, Events) from the upstream API and exposes a **Priority Inbox** endpoint. Notifications are ranked by type weight (`Placement > Result > Event`) combined with normalised recency, so the most important and most recent notifications always surface first.

**Port:** `3002`

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/notifications/priority?n=10` | GET | Top N notifications by priority score |
| `/notifications/all` | GET | Full notification list from upstream |
| `/health` | GET | Service health check |

### Server Startup

<img width="684" height="225" alt="Campus notification app server starting on port 3002" src="https://github.com/user-attachments/assets/76dcd31b-e556-499c-9eba-e466e5db0245" />

```bash
npm run notification
```

### GET /notifications/priority — Priority Inbox

Returns the top N notifications ranked by `typeWeight + normalisedRecency`. Placement notifications always appear before Results, which appear before Events. Within the same type, newer notifications rank higher.

<img width="954" height="825" alt="GET /notifications/priority returning top ranked notifications with Placement first" src="https://github.com/user-attachments/assets/498a92f0-2230-4590-b41f-35b8532b7a1c" />

### GET /notifications/all — All Notifications

Proxies the full notification list from the upstream evaluation API.

<img width="955" height="832" alt="GET /notifications/all returning the complete list of campus notifications" src="https://github.com/user-attachments/assets/5a4df466-38e9-44f6-bd21-6a4c8fb2f643" />
