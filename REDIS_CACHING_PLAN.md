# Redis Integration Plan: High-Performance Game Serving & Distributed State

## 1. Executive Summary
The Artifact Atlas backend currently relies on two mechanisms that hinder scalability and performance in a serverless or distributed environment (like Vercel, AWS Lambda, or multiple Node.js instances):
1. **In-Memory State (`globalThis`):** The `gameStore` and `pairCache` are stored in Node.js memory. This causes state loss across deployments, scales poorly across multiple edge/serverless functions, and leads to "Game Not Found" errors if user requests hit different server instances.
2. **Database Overhead (`OFFSET` Queries):** `POST /api/game/new` generates a random game by executing a PostgreSQL `findFirst` query with a random `skip` (OFFSET). Large offsets in PostgreSQL are computationally expensive, leading to slow game generation times.

**The Solution:** Integrate **Redis** (an open-source, in-memory data store) to handle both distributed session state and a pre-computed pool of randomized games for O(1) sub-millisecond game serving.

---

## 2. Architectural Design

### A. Pre-Computed Game Pool (`game:pool`)
Instead of querying the database on-demand for every new game request, we will maintain a buffer of pre-generated games in Redis.
- **Data Structure:** Redis List (Queue).
- **Operation:** When a user requests a new game, the API will perform an `LPOP` (Left Pop) to instantly retrieve and remove a pre-validated artifact ID and metadata from the queue.
- **Replenishment:** A background process or Cron job (e.g., Next.js Route Handler configured as a Vercel Cron) will periodically check the queue length (`LLEN`). If it falls below a threshold (e.g., 50 games), it will batch-generate new games using the existing DB logic and `RPUSH` (Right Push) them into the queue.
- **Fallback:** If the Redis queue is empty (cache miss), the API will synchronously generate a single game via the database (the current method) to ensure availability, and asynchronously trigger a replenishment job.

### B. Distributed Game State (`game:state:<uuid>`)
Active game sessions and guess history will be moved out of Node memory and into Redis.
- **Data Structure:** Redis Strings (storing serialized JSON).
- **TTL (Time-To-Live):** Every game session will have an `EXPIRE` set (e.g., 24 hours). This automatically cleans up abandoned games without needing a database garbage collection process.
- **Operation:** `GET` on game load, `SET` when a new guess is appended.

### C. Distribution & Pair Caching (`game:dist`, `game:pair:<hash>`)
- The artifact distribution mapping (which periods have which countries) can be cached in Redis with a longer TTL (e.g., 24 hours), refreshing via a cron job to avoid heavy `GROUP BY` queries on cold starts.
- Coordinate pair caching (`pairCache`) can be moved to Redis Strings to speed up distance and bearing calculations across all users globally.

---

## 3. Technology Evaluation

For Next.js integration, we have two primary open-source client options:

1. **`ioredis`** (Recommended for Node.js / Docker / Standard Servers)
   - *Pros:* Extremely robust, supports clustering, standard open-source library.
   - *Cons:* Relies on persistent TCP connections. Can exhaust connection limits in highly scaled serverless environments (e.g., thousands of Vercel edge functions spinning up).

2. **`@upstash/redis`** (Recommended for Vercel / Serverless / Edge)
   - *Pros:* Uses REST/HTTP to communicate with Redis. Connectionless, making it immune to TCP connection limits. Works perfectly in Next.js Edge Runtime.
   - *Cons:* Slightly higher latency than raw TCP due to HTTP overhead; optimized specifically for Upstash but works with standard Redis via REST proxies (like Webdis) if self-hosting.

**Decision:** If deploying to Vercel/Serverless, **`@upstash/redis`** is highly recommended. If self-hosting via Docker/Railway/Render, **`ioredis`** is the standard.

---

## 4. Implementation Steps

### Step 1: Infrastructure Setup
- Provision a Redis instance (Upstash, Redis Cloud, AWS ElastiCache, or local Docker container).
- Add connection strings to `.env`:
  ```env
  REDIS_URL="redis://user:pass@host:port"
  # Or for Upstash:
  UPSTASH_REDIS_REST_URL="https://..."
  UPSTASH_REDIS_REST_TOKEN="..."
  ```

### Step 2: Client Configuration (`lib/redis.ts`)
Create a singleton Redis client configured to survive hot-reloads in development (similar to the current Prisma setup).

### Step 3: Refactor State Management (`lib/gameStore.ts`)
- **Action:** Convert synchronous `get(id)` and `set(id, data)` methods to asynchronous `async get(id)` and `async set(id, data)`.
- **Serialization:** Implement `JSON.stringify` on write and `JSON.parse` on read. Ensure `bigint` types (like `objectId` and years) are safely serialized (e.g., converting to strings or numbers during serialization, as JSON does not support `bigint` natively).
- **TTL:** Ensure every `set` command includes an expiration (e.g., `EX 86400` for 24 hours).

### Step 4: Refactor API Routes
- Update `app/api/game/[id]/guess/route.ts` and `app/api/game/[id]/route.ts` to `await` the new asynchronous `gameStore` methods.

### Step 5: Implement Pre-computed Pool (`app/api/game/new/route.ts`)
- Change the route to `await redis.lpop('game:pool')`.
- If an item is returned, deserialize it, generate a UUID, save the state to Redis, and return it to the client.
- If `null` is returned (empty pool), execute the existing DB `OFFSET` logic, serve the game, and trigger a background update.

### Step 6: Create Replenishment Job (`app/api/cron/fill-pool/route.ts`)
- Create a protected API route (verified via a secret token header) that checks the pool size.
- Loop to generate N valid games using the existing `getDistribution` logic.
- Serialize the games and `RPUSH` them into `game:pool`.
- Configure this route to run periodically.

---

## 5. Critical Considerations & Trade-offs

### 1. Serialization of BigInts
Prisma returns `Object_ID`, `Object_Begin_Date`, and `Object_End_Date` as `BigInt`. `JSON.stringify` throws an error on `BigInt`.
**Mitigation:** Write a custom serializer/deserializer for Redis interactions, or map `BigInt` to standard JS `Number` before caching (since the years and IDs fit well within `Number.MAX_SAFE_INTEGER`).

### 2. Race Conditions in Game State
If two guess requests arrive at the exact same millisecond, they might both `GET` the state, see 3 guesses, append their guess, and `SET` the state. The last `SET` wins, overwriting the other guess.
**Mitigation:** Redis is single-threaded. We can use a small Lua script to ensure atomic updates: check if guess exists, append, and save in one operation. Alternatively, for a simpler approach, use Redis `JSON.ARRAPPEND` if using the RedisJSON module, or accept the minor risk given the sequential nature of UI interactions.

### 3. Cache Invalidation & Schema Changes
If the `GameState` or `GuessRecord` TypeScript types are updated in the future, old serialized JSON in Redis might cause runtime errors when parsed by the new code.
**Mitigation:** Include a `version: 1` field in the Redis JSON. When deserializing, if the version is missing or old, gracefully handle the migration or treat the game as expired/invalid.

### 4. Cold Start Penalty on the Replenisher
Generating 50 games via DB `OFFSET` sequentially might take 5-10 seconds, which could cause a serverless function timeout (typically 10-15s on free tiers).
**Mitigation:** Generate the games concurrently using `Promise.all()`, up to the database connection pool limit, to complete the batch within the serverless execution window.
