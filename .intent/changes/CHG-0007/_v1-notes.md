## scope.included

- vercel.json pins serverless functions to sin1, the region holding Neon (ap-southeast-1).

## scope.excluded

- Any caching layer; an in-memory read cache was measured, found unjustified, and reverted unshipped.
- Moving the database to ap-south-1 with functions in bom1 (needs a Neon project migration and data move).
- Deferring logApiEvent with waitUntil, and replacing the DB-backed rate limiter.
- Any change under src/ or tests/.

## preserved

- No route, schema, query or response changes; only the region the function process runs in.
- The whole suite is unchanged: no test added, modified, skipped or deleted.

## decisions

- sin1 rather than bom1: co-locating with the database removes ~230ms per statement, and Mumbai -> Singapore (~60ms) also beats Mumbai -> Virginia (~230ms) for SSR.
- Measured evidence, not inference: x-vercel-id reported bom1::iad1 (function in us-east-1) while the Neon host is ap-southeast-1, and /api/test:list p50 is 500ms against ~15-65ms of actual query work.
- Kept the diff to one config line: after the region fix every remaining optimisation measured in single-digit milliseconds, so the cache machinery was reverted.
- Cannot be verified locally: regions is applied by Vercel at deploy time; post-deploy check is x-vercel-id == bom1::sin1 plus a telemetry p50 re-read.

