const ALLOWED_ORIGINS = new Set([
  'https://jaketennet.com',
  'https://www.jaketennet.com',
  'https://t3nn3t.github.io',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
]);

const MIN_TIME_MS = 25_000;
const MAX_TIME_MS = 10 * 60_000;
const RUN_LIFETIME_MS = 2 * 60_000;
const CLOCK_TOLERANCE_MS = 3_000;

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.has(origin) ? origin : 'https://jaketennet.com',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function json(payload, { status = 200, origin = '', cache = 'no-store' } = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders(origin),
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': cache,
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export function validateScore(value) {
  const name = typeof value?.name === 'string' ? value.name.trim().toUpperCase() : '';
  const timeMs = value?.timeMs;

  if (!/^[A-Z0-9]{3}$/.test(name)) {
    return { ok: false, message: 'Enter exactly three letters or numbers.' };
  }

  if (!Number.isInteger(timeMs) || timeMs < MIN_TIME_MS || timeMs > MAX_TIME_MS) {
    return { ok: false, message: 'That time is outside the accepted range.' };
  }

  return { ok: true, name, timeMs };
}

function visitorKey(request) {
  return request.headers.get('CF-Connecting-IP') ?? 'unknown';
}

async function hashActor(request, runId) {
  const bytes = new TextEncoder().encode(`${visitorKey(request)}:${runId}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function withinRateLimit(binding, key) {
  if (!binding) return true;
  const result = await binding.limit({ key });
  return result.success;
}

async function startRun(request, env, origin) {
  if (!ALLOWED_ORIGINS.has(origin)) {
    return json({ error: 'This origin is not allowed.' }, { status: 403, origin });
  }
  if (!await withinRateLimit(env.RUN_RATE_LIMITER, visitorKey(request))) {
    return json({ error: 'Too many race starts. Wait a minute and try again.' }, { status: 429, origin });
  }

  const runId = crypto.randomUUID();
  const now = Date.now();
  const expiresAt = now + RUN_LIFETIME_MS;
  const actorHash = await hashActor(request, runId);

  await env.DB.batch([
    env.DB.prepare('DELETE FROM race_sessions WHERE expires_at < ?').bind(now - RUN_LIFETIME_MS),
    env.DB.prepare(`
      INSERT INTO race_sessions (id, actor_hash, started_at, expires_at)
      VALUES (?, ?, ?, ?)
    `).bind(runId, actorHash, now, expiresAt),
  ]);

  return json({ runId, expiresAt }, { status: 201, origin });
}

async function recordCheckpoint(request, env, origin, runId) {
  if (!ALLOWED_ORIGINS.has(origin)) {
    return json({ error: 'This origin is not allowed.' }, { status: 403, origin });
  }
  if (!await withinRateLimit(env.SCORE_RATE_LIMITER, visitorKey(request))) {
    return json({ error: 'Too many race updates. Wait a minute and try again.' }, { status: 429, origin });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Send a valid checkpoint.' }, { status: 400, origin });
  }

  const checkpoint = body?.checkpoint;
  if (!Number.isInteger(checkpoint) || checkpoint < 1 || checkpoint > 3) {
    return json({ error: 'Invalid checkpoint.' }, { status: 400, origin });
  }

  const now = Date.now();
  const actorHash = await hashActor(request, runId);
  const result = await env.DB.prepare(`
    UPDATE race_sessions
    SET checkpoint_index = ?, last_checkpoint_at = ?
    WHERE id = ?
      AND actor_hash = ?
      AND checkpoint_index = ?
      AND consumed_at IS NULL
      AND expires_at >= ?
  `).bind(checkpoint, now, runId, actorHash, checkpoint - 1, now).run();

  if (result.meta?.changes !== 1) {
    return json({ error: 'This race checkpoint is invalid or out of order.' }, { status: 409, origin });
  }

  return json({ ok: true, checkpoint }, { origin });
}

async function finishRunSession(request, env, origin, runId) {
  if (!ALLOWED_ORIGINS.has(origin)) {
    return json({ error: 'This origin is not allowed.' }, { status: 403, origin });
  }
  if (!await withinRateLimit(env.SCORE_RATE_LIMITER, visitorKey(request))) {
    return json({ error: 'Too many race updates. Wait a minute and try again.' }, { status: 429, origin });
  }

  const now = Date.now();
  const actorHash = await hashActor(request, runId);
  const result = await env.DB.prepare(`
    UPDATE race_sessions
    SET finished_at = ?
    WHERE id = ?
      AND actor_hash = ?
      AND checkpoint_index = 3
      AND finished_at IS NULL
      AND consumed_at IS NULL
      AND expires_at >= ?
  `).bind(now, runId, actorHash, now).run();

  if (result.meta?.changes !== 1) {
    return json({ error: 'This race finish could not be verified.' }, { status: 409, origin });
  }

  return json({ ok: true }, { origin });
}

async function listScores(env, origin, limit = 5) {
  const result = await env.DB.prepare(`
    SELECT name, time_ms AS timeMs, created_at AS createdAt
    FROM scores
    ORDER BY time_ms ASC, created_at ASC
    LIMIT ?
  `).bind(limit).all();

  return json(
    { scores: result.results ?? [] },
    { origin, cache: 'public, max-age=10, stale-while-revalidate=20' },
  );
}

async function createScore(request, env, origin) {
  if (!ALLOWED_ORIGINS.has(origin)) {
    return json({ error: 'This origin is not allowed.' }, { status: 403, origin });
  }
  if (!await withinRateLimit(env.SCORE_RATE_LIMITER, visitorKey(request))) {
    return json({ error: 'Too many score attempts. Wait a minute and try again.' }, { status: 429, origin });
  }

  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (contentLength > 1_024) {
    return json({ error: 'Request is too large.' }, { status: 413, origin });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Send a valid JSON score.' }, { status: 400, origin });
  }

  const score = validateScore(body);
  if (!score.ok) return json({ error: score.message }, { status: 400, origin });

  const runId = typeof body?.runId === 'string' ? body.runId : '';
  if (!/^[0-9a-f-]{36}$/i.test(runId)) {
    return json({ error: 'This run could not be verified.' }, { status: 400, origin });
  }

  const session = await env.DB.prepare(`
    SELECT actor_hash AS actorHash, started_at AS startedAt, expires_at AS expiresAt,
      checkpoint_index AS checkpointIndex, finished_at AS finishedAt, consumed_at AS consumedAt
    FROM race_sessions
    WHERE id = ?
  `).bind(runId).first();
  const now = Date.now();
  const actorHash = await hashActor(request, runId);
  const serverElapsed = session?.finishedAt ? session.finishedAt - session.startedAt : 0;
  const sessionIsValid = session
    && session.actorHash === actorHash
    && session.checkpointIndex === 3
    && Number.isInteger(session.finishedAt)
    && session.consumedAt === null
    && session.expiresAt >= now
    && serverElapsed >= MIN_TIME_MS
    && Math.abs(serverElapsed - score.timeMs) <= CLOCK_TOLERANCE_MS;

  if (!sessionIsValid) {
    return json({ error: 'This run could not be verified.' }, { status: 409, origin });
  }

  const consumed = await env.DB.prepare(`
    UPDATE race_sessions SET consumed_at = ?
    WHERE id = ? AND consumed_at IS NULL
  `).bind(now, runId).run();
  if (consumed.meta?.changes !== 1) {
    return json({ error: 'This run has already been submitted.' }, { status: 409, origin });
  }

  await env.DB.prepare('INSERT INTO scores (name, time_ms) VALUES (?, ?)')
    .bind(score.name, score.timeMs)
    .run();
  await env.DB.prepare(`
    DELETE FROM scores
    WHERE id NOT IN (
      SELECT id FROM scores ORDER BY time_ms ASC, created_at ASC LIMIT 500
    )
  `).run();

  return listScores(env, origin);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('origin') ?? '';

    if (request.method === 'OPTIONS') {
      if (!ALLOWED_ORIGINS.has(origin)) return new Response(null, { status: 403 });
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (url.pathname === '/scores' && request.method === 'GET') {
      const limit = url.searchParams.get('limit') === '10' ? 10 : 5;
      return listScores(env, origin, limit);
    }
    if (url.pathname === '/runs' && request.method === 'POST') return startRun(request, env, origin);
    const checkpointMatch = url.pathname.match(/^\/runs\/([0-9a-f-]{36})\/checkpoints$/i);
    if (checkpointMatch && request.method === 'POST') {
      return recordCheckpoint(request, env, origin, checkpointMatch[1]);
    }
    const finishMatch = url.pathname.match(/^\/runs\/([0-9a-f-]{36})\/finish$/i);
    if (finishMatch && request.method === 'POST') {
      return finishRunSession(request, env, origin, finishMatch[1]);
    }
    if (url.pathname === '/scores' && request.method === 'POST') return createScore(request, env, origin);
    if (url.pathname === '/health' && request.method === 'GET') return json({ ok: true }, { origin });

    return json({ error: 'Not found.' }, { status: 404, origin });
  },
};
