# Notification System Design

## Table of Contents

- [Stage 1 — REST API Design](#stage-1--rest-api-design)
- [Stage 2 — Persistent Storage Design](#stage-2--persistent-storage-design)
- [Stage 3 — Query Analysis and Optimisation](#stage-3--query-analysis-and-optimisation)
- [Stage 4 — Performance Optimisation](#stage-4--performance-optimisation)
- [Stage 5 — Bulk Notification Redesign](#stage-5--bulk-notification-redesign)
- [Stage 6 — Priority Inbox](#stage-6--priority-inbox)

---

# Stage 1 — REST API Design

## Core Actions

The notification platform must support:
1. Fetch all notifications for a logged-in student
2. Fetch unread notification count
3. Mark a notification as read
4. Mark all notifications as read
5. Send a notification (admin/HR action)
6. Subscribe to real-time notifications

---

## Endpoints

### 1. Get Notifications for a Student

```
GET /api/v1/notifications
```

**Headers**
```json
{
  "Authorization": "Bearer <jwt_token>",
  "Content-Type": "application/json"
}
```

**Query Parameters**

| Parameter | Type    | Description                             |
|-----------|---------|-----------------------------------------|
| type      | string  | Filter: `Placement`, `Event`, `Result`  |
| isRead    | boolean | Filter by read status                   |
| page      | number  | Page number (default: 1)                |
| limit     | number  | Items per page (default: 20)            |

**Response (200)**
```json
{
  "notifications": [
    {
      "id": "d146095a-0d86-4a34-9e69-3900a14576bc",
      "type": "Placement",
      "message": "Google is hiring — apply by Dec 10",
      "isRead": false,
      "createdAt": "2026-04-22T17:51:30Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 143
  }
}
```

---

### 2. Get Unread Count

```
GET /api/v1/notifications/unread-count
```

**Headers**
```json
{ "Authorization": "Bearer <jwt_token>" }
```

**Response (200)**
```json
{ "unreadCount": 12 }
```

---

### 3. Mark Notification as Read

```
PATCH /api/v1/notifications/:id/read
```

**Headers**
```json
{ "Authorization": "Bearer <jwt_token>" }
```

**Response (200)**
```json
{
  "id": "d146095a-0d86-4a34-9e69-3900a14576bc",
  "isRead": true,
  "readAt": "2026-04-22T18:00:00Z"
}
```

---

### 4. Mark All as Read

```
PATCH /api/v1/notifications/read-all
```

**Headers**
```json
{ "Authorization": "Bearer <jwt_token>" }
```

**Response (200)**
```json
{ "updatedCount": 12 }
```

---

### 5. Send Notification (Admin)

```
POST /api/v1/notifications
```

**Headers**
```json
{
  "Authorization": "Bearer <admin_jwt_token>",
  "Content-Type": "application/json"
}
```

**Request Body**
```json
{
  "type": "Placement",
  "message": "CSX Corporation is hiring",
  "targetAudience": "all"
}
```

**Response (201)**
```json
{
  "notificationId": "b283218f-ea5a-4b7c-93a9-1f2f240d64b0",
  "status": "queued",
  "recipientCount": 50000
}
```

---

## Real-Time Notification Mechanism

**Chosen approach: WebSockets (via Socket.IO)**

When a student logs in, their client opens a WebSocket connection authenticated with a JWT. The server maintains a room per `studentID`. When a new notification is pushed, the server emits an event to that room.

```js
// Client subscribes on connect
socket.on("connect", () => {
  socket.emit("subscribe", { token: "<jwt>" });
});

// Server emits to the student's room
socket.to(`student:${studentId}`).emit("notification", {
  id: "...",
  type: "Placement",
  message: "...",
  createdAt: "..."
});
```

**Why WebSockets over SSE/polling:**

| Option | Pro | Con |
|--------|-----|-----|
| WebSockets | Bi-directional, client can acknowledge; scales to 50k concurrent | Requires persistent connection infrastructure |
| SSE | Simple, HTTP-native | Unidirectional only; no client acknowledgement |
| Long-polling | Works anywhere | High server load; thundering herd on reconnect |

---

# Stage 2 — Persistent Storage Design

## Recommended Database: PostgreSQL

**Why PostgreSQL:**
- ACID compliance — notifications must not be lost or duplicated
- Rich indexing (composite, partial) — essential for `studentID + isRead + createdAt` queries
- JSON support for flexible `metadata` field
- Proven at scale with read replicas and connection pooling (PgBouncer)

---

## Schema

```sql
-- Students table (abbreviated — managed by auth service)
CREATE TABLE students (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(255) NOT NULL,
  email       VARCHAR(255) UNIQUE NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Notification type enum
CREATE TYPE notification_type AS ENUM ('Placement', 'Result', 'Event');

-- Notifications master table (one row per broadcast)
CREATE TABLE notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type        notification_type NOT NULL,
  message     TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Per-student delivery and read status
CREATE TABLE student_notifications (
  id               BIGSERIAL PRIMARY KEY,
  student_id       INT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  notification_id  UUID NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  is_read          BOOLEAN DEFAULT FALSE,
  read_at          TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (student_id, notification_id)
);

-- Partial index for the hot unread-fetch path
CREATE INDEX idx_sn_student_unread
  ON student_notifications (student_id, created_at DESC)
  WHERE is_read = FALSE;

-- General index for paginated history
CREATE INDEX idx_sn_student_created
  ON student_notifications (student_id, created_at DESC);
```

---

## Scalability Problems as Data Grows

| Problem | Root Cause | Solution |
|---------|-----------|----------|
| Slow unread fetch | Full table scan on `student_notifications` | Partial index on `is_read = false`; Redis unread counter |
| Notification fan-out | Writing 50,000 rows per broadcast | Job queue (BullMQ/Kafka); async workers |
| Table bloat | Billions of rows over time | Partition by `created_at` (monthly); archive old data |
| Hot primary DB | All reads hitting one node | Read replicas for all GET queries |
| Connection exhaustion | 50k students connecting simultaneously | PgBouncer connection pooling |

---

## Relevant Queries

**Fetch unread notifications for a student:**
```sql
SELECT n.id, n.type, n.message, n.created_at, sn.is_read
FROM student_notifications sn
JOIN notifications n ON n.id = sn.notification_id
WHERE sn.student_id = $1
  AND sn.is_read = FALSE
ORDER BY n.created_at DESC
LIMIT 20 OFFSET $2;
```

**Unread count:**
```sql
SELECT COUNT(*)
FROM student_notifications
WHERE student_id = $1 AND is_read = FALSE;
```

**Mark all read:**
```sql
UPDATE student_notifications
SET is_read = TRUE, read_at = NOW()
WHERE student_id = $1 AND is_read = FALSE;
```

---

# Stage 3 — Query Analysis and Optimisation

## The Slow Query

```sql
SELECT * FROM notifications
WHERE studentID = 1042 AND isRead = false
ORDER BY createdAt DESC;
```

## Is This Query Accurate?

**No — it has a design flaw.**

In a properly normalised schema, `notifications` stores one row per broadcast. `studentID` and `isRead` belong in a `student_notifications` join table. Putting them directly in `notifications` implies a denormalised design (one row per student-notification pair) which creates billions of rows and does not scale.

Assuming the flat schema is given:

## Why Is It Slow?

1. **No index on `(studentID, isRead, createdAt)`** — PostgreSQL performs a sequential scan across 5,000,000 rows.
2. **`SELECT *`** — fetches all columns including large `message` blobs, increasing I/O unnecessarily.
3. **`isRead = false`** is highly selective but without a partial index, the planner cannot take advantage of it.

## What to Change

```sql
-- Add a composite partial index covering the exact filter + sort
CREATE INDEX idx_notifications_student_unread
  ON notifications (studentID, createdAt DESC)
  WHERE isRead = false;

-- Select only required columns; add LIMIT to bound the result set
SELECT id, type, message, createdAt
FROM notifications
WHERE studentID = 1042
  AND isRead = false
ORDER BY createdAt DESC
LIMIT 20;
```

## Likely Performance Improvement

| Metric | Before | After |
|--------|--------|-------|
| Scan type | Sequential (5M rows) | Index scan (targeted rows) |
| Complexity | O(N) | O(log N + K) |
| Estimated latency | ~800 ms | ~5 ms |

## Should We Index Every Column?

**No — this advice is harmful.**

- Every index adds write overhead: each `INSERT`, `UPDATE`, and `DELETE` must update all indexes.
- Indexes consume RAM (PostgreSQL shared_buffers) and disk space.
- Too many indexes confuse the query planner, which may select a suboptimal one.
- Only index columns that appear in `WHERE`, `ORDER BY`, or `JOIN ON` clauses of frequent queries.

**Add targeted, selective indexes — not blanket coverage.**

## Query: Students Who Got a Placement Notification in the Last 7 Days

```sql
-- Normalised schema
SELECT DISTINCT sn.student_id
FROM student_notifications sn
JOIN notifications n ON n.id = sn.notification_id
WHERE n.type = 'Placement'
  AND n.created_at >= NOW() - INTERVAL '7 days';

-- Flat schema with notificationType column
SELECT DISTINCT studentID
FROM notifications
WHERE notificationType = 'Placement'
  AND createdAt >= NOW() - INTERVAL '7 days';
```

---

# Stage 4 — Performance Optimisation

## Problem

Notifications are fetched on every page load for every student — the database gets overwhelmed, causing slow responses and poor user experience.

## Solutions and Trade-offs

### 1. Redis Cache (Recommended Primary Solution)

Cache each student's unread notification list in Redis with a short TTL.

```
Key:   notifications:student:{studentID}:unread
Value: JSON array of unread notifications
TTL:   60 seconds
```

On `PATCH /read`, invalidate the key or decrement a counter.

| Trade-off | Detail |
|-----------|--------|
| Pro | Dramatically reduces DB reads |
| Pro | Sub-millisecond reads from cache |
| Con | Up to TTL seconds of stale data |
| Con | Cache invalidation logic on mark-read |

### 2. Pagination + LIMIT

Never return all notifications. Enforce server-side pagination with `LIMIT` and `OFFSET` (or cursor-based). Reduces data per request and query cost.

### 3. Read Replicas

Route all `GET` queries to a PostgreSQL read replica. The primary handles only writes.

| Trade-off | Detail |
|-----------|--------|
| Pro | Offloads primary; horizontal read scaling |
| Con | Replication lag may briefly serve stale data |

### 4. Unread Count as a Redis Counter

Store unread count as a Redis integer per student (`INCR`/`DECR`). Avoid a `COUNT(*)` DB query on every page load.

### 5. WebSocket Push Instead of Polling

Rather than fetching on every page load, push new notifications via WebSocket. The client fetches once on initial load; all subsequent updates are server-pushed.

| Trade-off | Detail |
|-----------|--------|
| Pro | Eliminates periodic polling entirely |
| Con | Requires persistent WebSocket infrastructure |

---

# Stage 5 — Bulk Notification Redesign

## Problem with the Current Pseudocode

```python
function notify_all(student_ids: array, message: string):
    for student_id in student_ids:
        send_email(student_id, message)   # calls Email API
        save_to_db(student_id, message)   # DB insert
        push_to_app(student_id, message)  # WebSocket push
```

**Shortcomings:**

1. **Sequential loop** — 50,000 synchronous iterations block the entire server for minutes.
2. **No error handling** — if `send_email` throws at student 200, subsequent students are skipped silently.
3. **Tight coupling** — email, DB, and push are chained. A failure in one prevents the others.
4. **No partial failure recovery** — if the process crashes at student 25,000 there is no checkpoint; the job must restart from zero.
5. **Email API rate limits** — 50,000 sequential API calls will immediately hit rate limits.

## What Happened (200 Email Failures Midway)

The `send_email` call failed for 200 students. The current design has no retry, so those students never receive the email and there is no record of which ones failed. The only recovery option is a full re-run, which risks double-sending to the other 49,800.

## Redesigned Approach — Message Queue

```
HR clicks "Notify All"
      │
      ▼
API: write one broadcast row to notifications table
      │
      ▼
Bulk insert into student_notifications (single SQL statement)
      │
      ▼
Enqueue one email job per student → BullMQ / Kafka
      │
      ├─► Email Worker   (retries with exponential backoff, dead-letter queue)
      └─► Push Worker    (WebSocket broadcast, non-blocking)
```

## Revised Pseudocode

```typescript
async function notifyAll(studentIds: string[], message: string): Promise<void> {
  // 1. Persist the broadcast notification once (source of truth)
  const notificationId = await saveNotificationToDB(message);

  // 2. Bulk insert delivery records — one SQL statement, not 50,000
  await bulkInsertStudentNotifications(studentIds, notificationId);

  // 3. Enqueue email jobs — the queue handles retries and rate limiting
  const jobs = studentIds.map((id) => ({
    name: "send-email",
    data: { studentId: id, notificationId, message },
  }));
  await emailQueue.addBulk(jobs);

  // 4. Broadcast via WebSocket (non-blocking, best-effort)
  socketServer.emit("broadcast", { type: "Placement", message });
}

// Email worker — BullMQ retries automatically on throw
emailQueue.process("send-email", async (job) => {
  await sendEmail(job.data.studentId, job.data.message);
});
```

## Should Saving to DB and Sending Email Happen Together?

**No — they must be decoupled.**

- **DB insert first**: it is the source of truth. Even if email delivery fails, the student can see the notification in-app.
- **Email is best-effort**: it should be retried independently by the queue without blocking or rolling back the DB write.
- Coupling them in a single transaction means a failed email silently deletes the notification record.

**Decoupled flow guarantees:**
- Notification is always persisted regardless of email failures
- Failed emails are retried with exponential backoff
- A dead-letter queue captures permanently failed jobs for manual review
- Restarting after a crash only replays unacknowledged queue jobs — no double-sends

---

# Stage 6 — Priority Inbox

## Requirement

Display the top N most important unread notifications first (N configurable: 10, 15, 20, etc.). Priority is a combination of **type weight** and **recency**.

## Scoring Approach

### Type Weights

| Type      | Weight |
|-----------|--------|
| Placement | 3      |
| Result    | 2      |
| Event     | 1      |

### Scoring Formula

```
score = typeWeight + normalisedRecency
```

`normalisedRecency` maps each notification's timestamp to the range **[0, 1)** relative to the oldest and newest items in the set:

```
normalisedRecency = (timestamp - oldest) / (newest - oldest)
```

Because the recency component is always less than 1 and the gap between type weights is 1, **type priority always dominates** — a Placement notification will always rank above any Result, regardless of age. Within the same type, newer notifications rank higher.

### Complexity

- Sorting N notifications: **O(n log n)**
- No database query required — computed entirely in memory from the API response

## Maintaining Top N Efficiently as New Notifications Arrive

For a live stream of incoming notifications, re-sorting the full list on every event is wasteful. The efficient approach is a **min-heap of size N**:

1. Compute the score for the incoming notification.
2. If heap size < N → push it directly.
3. If score > heap's minimum → pop the minimum, push the new notification.
4. The heap always holds the current top-N with **O(log N) per insertion**.

This keeps the priority inbox up to date without rescanning the entire notification history.

## Implementation

**Language:** TypeScript + Express
**File:** [`src/notification_app_be/services/priority.service.ts`](src/notification_app_be/services/priority.service.ts)

### Endpoint

```
GET /notifications/priority?n=10
```

### Sample Response

```json
{
  "topNotifications": [
    {
      "ID": "b283218f-ea5a-4b7c-93a9-1f2f240d64b0",
      "Type": "Placement",
      "Message": "CSX Corporation hiring",
      "Timestamp": "2026-04-22 17:51:18"
    },
    {
      "ID": "d146095a-0d86-4a34-9e69-3900a14576bc",
      "Type": "Result",
      "Message": "mid-sem",
      "Timestamp": "2026-04-22 17:51:30"
    }
  ],
  "count": 10,
  "scoringStrategy": "type-priority (Placement > Result > Event) + normalised recency"
}
```

## Output Screenshots

### Server Startup

<img width="684" height="225" alt="Campus notification app server starting on port 3002" src="https://github.com/user-attachments/assets/76dcd31b-e556-499c-9eba-e466e5db0245" />

### GET /notifications/priority — Priority Inbox (Top 10)

Placement-type notifications appear first, followed by Results, then Events. Within each type, the most recent notification is ranked higher.

<img width="954" height="825" alt="GET /notifications/priority returning top ranked notifications with Placement first" src="https://github.com/user-attachments/assets/498a92f0-2230-4590-b41f-35b8532b7a1c" />

### GET /notifications/all — Full Notification List

<img width="955" height="832" alt="GET /notifications/all returning the complete list of campus notifications" src="https://github.com/user-attachments/assets/5a4df466-38e9-44f6-bd21-6a4c8fb2f643" />
