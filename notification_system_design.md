# Stage 1

## REST API Design – Campus Notification Platform

### Core Actions

The notification platform must support:
1. Fetch all notifications for a logged-in student
2. Fetch unread notification count
3. Mark a notification as read
4. Mark all notifications as read
5. Send a notification (admin/HR action)
6. Subscribe to real-time notifications

---

### Endpoints

#### 1. Get Notifications for a Student

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
| Parameter | Type   | Description                        |
|-----------|--------|------------------------------------|
| type      | string | Filter: `Placement`, `Event`, `Result` |
| isRead    | boolean | Filter by read status             |
| page      | number | Page number (default: 1)           |
| limit     | number | Items per page (default: 20)       |

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

#### 2. Get Unread Count

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

#### 3. Mark Notification as Read

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

#### 4. Mark All as Read

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

#### 5. Send Notification (Admin)

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

### Real-Time Notification Mechanism

**Chosen approach: WebSockets (via Socket.IO)**

When a student logs in, their client opens a WebSocket connection authenticated with a JWT. The server maintains a room per `studentID`. When a new notification is pushed, the server emits an event to that room.

```
// Client subscribes
socket.on("connect", () => {
  socket.emit("subscribe", { token: "<jwt>" });
});

// Server emits
socket.to(`student:${studentId}`).emit("notification", {
  id: "...",
  type: "Placement",
  message: "...",
  createdAt: "..."
});
```

**Why WebSockets over SSE/polling:**
- Bi-directional: client can acknowledge receipt
- Efficient for high-concurrency (50k students)
- Better than polling (avoids thundering herd)
- SSE is simpler but unidirectional

---

# Stage 2

## Persistent Storage Design

### Recommended Database: PostgreSQL

**Why PostgreSQL:**
- ACID compliance — notifications must not be lost or duplicated
- Rich indexing (composite, partial) — essential for `studentID + isRead + createdAt` queries
- JSON support for flexible `metadata` field
- Proven at scale with read replicas and connection pooling (PgBouncer)

---

### Schema

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

-- Notifications master table (one row per notification broadcast)
CREATE TABLE notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type        notification_type NOT NULL,
  message     TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Per-student delivery/read status
CREATE TABLE student_notifications (
  id               BIGSERIAL PRIMARY KEY,
  student_id       INT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  notification_id  UUID NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  is_read          BOOLEAN DEFAULT FALSE,
  read_at          TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (student_id, notification_id)
);

-- Indexes for hot query paths
CREATE INDEX idx_sn_student_unread
  ON student_notifications (student_id, is_read, created_at DESC)
  WHERE is_read = FALSE;

CREATE INDEX idx_sn_student_created
  ON student_notifications (student_id, created_at DESC);
```

---

### Scalability Problems as Data Grows

| Problem | Root Cause | Solution |
|---------|-----------|----------|
| Slow unread fetch | Full table scan on `student_notifications` | Partial index on `is_read = false`; Redis unread counter |
| Notification fan-out | Writing 50,000 rows per broadcast | Job queue (BullMQ/Kafka); async workers |
| Table bloat | Billions of `student_notifications` rows over time | Partition by `created_at` (monthly); archive old data to cold storage |
| Hot primary DB | All reads hitting primary | Read replicas for GET queries |
| Connection exhaustion | 50k students opening DB connections | PgBouncer connection pooling |

---

### Relevant Queries

**Fetch unread notifications for a student (from Stage 1 API):**
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
SELECT COUNT(*) FROM student_notifications
WHERE student_id = $1 AND is_read = FALSE;
```

**Mark all read:**
```sql
UPDATE student_notifications
SET is_read = TRUE, read_at = NOW()
WHERE student_id = $1 AND is_read = FALSE;
```

---

# Stage 3

## Query Analysis and Optimisation

### The slow query

```sql
SELECT * FROM notifications
WHERE studentID = 1042 AND isRead = false
ORDER BY createdAt DESC;
```

### Is this query accurate?

**No — it has a design flaw.**
In a properly normalised schema, `notifications` is a broadcast table (one row per notification). `studentID` and `isRead` belong in a `student_notifications` join table. Querying `notifications` directly with these columns implies a denormalised design that stores one row per (student, notification) pair, which does not scale.

Assuming the schema is flat (one row per student-notification pair):

### Why is it slow?

1. **No index on `(studentID, isRead, createdAt)`** — PostgreSQL does a sequential scan across 5,000,000 rows.
2. **`SELECT *`** — fetches all columns including large `message` blobs, increasing I/O.
3. **`isRead = false`** is highly selective but not indexed — the planner cannot use a partial index if none exists.

### What to change

```sql
-- Add a composite partial index
CREATE INDEX idx_notifications_student_unread
  ON notifications (studentID, createdAt DESC)
  WHERE isRead = false;

-- Rewrite query to select only needed columns
SELECT id, type, message, createdAt
FROM notifications
WHERE studentID = 1042 AND isRead = false
ORDER BY createdAt DESC
LIMIT 20;
```

### Likely computation cost improvement

| Before | After |
|--------|-------|
| Sequential scan ~5M rows | Index scan → few hundred rows |
| O(N) | O(log N + K) where K = result count |
| ~800ms | ~5ms |

### Should we add indexes on every column?

**No — this advice is harmful.**

- Every index adds write overhead (`INSERT`, `UPDATE`, `DELETE` must update all indexes).
- Indexes consume disk space and RAM (shared_buffers).
- The query planner may choose wrong indexes if there are too many.
- Only index columns that appear in `WHERE`, `ORDER BY`, or `JOIN ON` clauses of frequent queries.

**Add targeted indexes, not blanket coverage.**

### Query: Students who received a Placement notification in the last 7 days

```sql
SELECT DISTINCT sn.student_id
FROM student_notifications sn
JOIN notifications n ON n.id = sn.notification_id
WHERE n.type = 'Placement'
  AND n.created_at >= NOW() - INTERVAL '7 days';
```

If using a flat schema with `notificationType` column:
```sql
SELECT DISTINCT studentID
FROM notifications
WHERE notificationType = 'Placement'
  AND createdAt >= NOW() - INTERVAL '7 days';
```

---

# Stage 4

## Performance Optimisation — Reducing DB Load

### Problem

Notifications are fetched on every page load for every student → DB overwhelmed.

### Solutions and Trade-offs

#### 1. Redis Cache (Recommended Primary Solution)

Cache each student's notification list and unread count in Redis with a short TTL (e.g., 60 seconds).

```
Key: notifications:student:{studentID}:unread
Value: JSON array of unread notifications
TTL: 60 seconds
```

On `PATCH /read`, invalidate or decrement the cache key.

| Trade-off | Detail |
|-----------|--------|
| Pro | Dramatically reduces DB reads |
| Pro | Sub-millisecond reads from Redis |
| Con | Stale data for up to TTL window |
| Con | Cache invalidation complexity on mark-read |

#### 2. Pagination + Limit

Never return all notifications — enforce `LIMIT` and pagination. Reduces data transferred per request.

#### 3. Read Replicas

Route all GET queries to a PostgreSQL read replica. The primary handles only writes.

| Trade-off | Detail |
|-----------|--------|
| Pro | Offloads primary; horizontal read scaling |
| Con | Replication lag may serve slightly stale data |

#### 4. Unread Count in Redis (Separate from List)

Store unread count as a Redis integer (`INCR`/`DECR`). Avoid querying the DB for count on every load.

#### 5. CDN / HTTP Caching for Static Notification Templates

Notification metadata that doesn't change (e.g., event announcements) can be cached at CDN level with `Cache-Control` headers.

#### 6. WebSocket Push Instead of Polling

Rather than fetching on every page load, push new notifications to the client via WebSocket. Client only needs to fetch on initial load; subsequent updates are pushed.

| Trade-off | Detail |
|-----------|--------|
| Pro | Eliminates periodic polling entirely |
| Con | Requires persistent WebSocket infrastructure |

---

# Stage 5

## Bulk Notification Redesign

### Problem with the current pseudocode

```python
function notify_all(student_ids: array, message: string):
    for student_id in student_ids:
        send_email(student_id, message)   # calls Email API
        save_to_db(student_id, message)   # DB insert
        push_to_app(student_id, message)  # WebSocket push
```

**Shortcomings:**

1. **Sequential loop** — 50,000 iterations in a single thread. This will take minutes and block the server.
2. **No error handling** — if `send_email` fails for student 200, the loop stops (or silently continues). There is no retry.
3. **Tight coupling** — all three operations (email, DB, push) are synchronous and coupled. If any one fails, it blocks the rest.
4. **No partial failure recovery** — if the process crashes at student 25,000, there is no checkpoint to resume from.
5. **Email API rate limits** — hammering the Email API for 50,000 calls in a loop will hit rate limits.

### What happened (200 email failures midway)

The `send_email` call failed for 200 students. In the current design there is no retry, so those students never receive the email. There is also no record of which students failed.

### Redesigned Approach

**Use a message queue (BullMQ / Kafka / RabbitMQ)**

```
HR clicks "Notify All"
      │
      ▼
API: save broadcast to notifications table (1 row)
      │
      ▼
Enqueue job per student → Queue (BullMQ / Kafka)
      │
      ├─► Email Worker (retries on failure, dead-letter queue)
      ├─► DB Worker (bulk insert student_notifications)
      └─► Push Worker (WebSocket emit)
```

### Revised Pseudocode

```typescript
async function notifyAll(studentIds: string[], message: string): Promise<void> {
  // 1. Save broadcast notification once
  const notificationId = await saveNotificationToDB(message);

  // 2. Bulk insert student_notifications (single query, not per-student)
  await bulkInsertStudentNotifications(studentIds, notificationId);

  // 3. Enqueue email jobs (queue handles retries, rate limiting)
  const jobs = studentIds.map((id) => ({
    name: "send-email",
    data: { studentId: id, notificationId, message },
  }));
  await emailQueue.addBulk(jobs);

  // 4. Push to connected WebSocket clients (non-blocking)
  socketServer.emit("broadcast", { type: "Placement", message });
}

// Email worker with retry
emailQueue.process("send-email", async (job) => {
  await sendEmail(job.data.studentId, job.data.message);
  // BullMQ automatically retries on throw, with exponential backoff
});
```

### Should saving to DB and sending email happen together?

**No — they should be decoupled.**

- **DB insert must happen first** — it is the source of truth. If the email fails, the notification still exists and the student can see it in-app.
- **Email is a best-effort delivery channel** — it should be retried independently via the queue without blocking or rolling back the DB write.
- Coupling them in a transaction means a failed email rolls back the notification record, causing silent data loss.

**Decoupled flow guarantees:**
- Notification is always persisted even if email delivery fails
- Failed emails are retried with exponential backoff
- A dead-letter queue captures permanently failed jobs for manual inspection
- The process is resumable — restarting after a crash only replays unacknowledged queue jobs

---

# Stage 6

## Priority Inbox

### Approach

Priority is determined by a combination of **type weight** and **recency**.

| Type      | Weight |
|-----------|--------|
| Placement | 3      |
| Result    | 2      |
| Event     | 1      |

**Scoring formula:**
```
score = typeWeight + normalised_recency
```

`normalised_recency` maps the notification's timestamp to [0, 1) relative to the oldest and newest notifications in the set, so recency never overrides the type priority (the gap between type weights is 1, recency is always < 1).

**Why this formula:**
- A Placement notification (weight=3) always ranks above any Result (weight=2), regardless of age.
- Among same-type notifications, the newest appears first.
- Simple, O(n log n), no DB query needed.

### Maintaining Top 10 Efficiently as New Notifications Arrive

Use a **min-heap of size N** (min-heap on score):

1. For each incoming notification, compute its score.
2. If heap size < N: push it.
3. Else if score > heap minimum: pop the minimum, push the new notification.
4. The heap always holds the top-N with O(log N) per insertion.

This avoids re-sorting the entire list on every new notification.

### Implementation

See `notification_app_be/index.ts` for the working TypeScript + Express implementation.

**Endpoint:**
```
GET /notifications/priority?n=10
```

**Response:**
```json
{
  "topNotifications": [
    {
      "ID": "b283218f-...",
      "Type": "Placement",
      "Message": "CSX Corporation hiring",
      "Timestamp": "2026-04-22 17:51:18"
    }
  ],
  "count": 10,
  "scoringStrategy": "type-priority (Placement>Result>Event) + recency"
}
```
