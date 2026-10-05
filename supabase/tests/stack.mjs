#!/usr/bin/env node
/**
 * Pila local "tipo Supabase" para pruebas de integración y E2E:
 *   · PostgreSQL 16 temporal con el stub de Supabase + la migración real
 *   · PostgREST (el mismo motor REST que usa Supabase) con verificación JWT
 *   · Servidor en :54321 que expone /rest/v1 (proxy a PostgREST) y un /auth/v1
 *     simulado (código por correo = 123456) que emite JWT como Supabase Auth.
 *
 * No cubre Realtime ni el proveedor Microsoft (requieren el servicio real).
 *
 * Uso: node supabase/tests/stack.mjs      (Ctrl+C para detener)
 * Requiere: binarios de PostgreSQL y POSTGREST_BIN (o `postgrest` en PATH).
 */
import { spawn, execFileSync } from 'node:child_process';
import { createHmac, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync, chownSync, rmSync, readdirSync } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const JWT_SECRET = 'alignment-unblock-local-test-secret-0123456789';
export const OTP_CODE = '123456';
export const PORT = Number(process.env.STACK_PORT ?? 54321);
const PG_PORT = Number(process.env.STACK_PG_PORT ?? 55433);
const REST_PORT = PORT + 1;
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const b64 = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');
export function signJwt(payload) {
  const head = b64({ alg: 'HS256', typ: 'JWT' });
  const body = b64(payload);
  const sig = createHmac('sha256', JWT_SECRET).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${sig}`;
}
export const ANON_KEY = signJwt({ role: 'anon', iss: 'supabase-local', exp: 4102444800 });

function pgBin() {
  const base = '/usr/lib/postgresql';
  const v = readdirSync(base).sort((a, b) => Number(b) - Number(a))[0];
  return join(base, v, 'bin');
}

export async function startStack({ members = [] } = {}) {
  const bin = pgBin();
  // Directorio fijo por puerto: si una corrida anterior quedó viva, se detiene y se limpia.
  const dir = join(tmpdir(), `au-stack-${PG_PORT}`);
  const asPg = process.getuid?.() === 0;
  if (existsSync(join(dir, 'data', 'postmaster.pid'))) {
    try {
      execFileSync(asPg ? 'runuser' : join(bin, 'pg_ctl'), asPg ? ['-u', 'postgres', '--', join(bin, 'pg_ctl'), '-D', join(dir, 'data'), 'stop', '-m', 'immediate'] : ['-D', join(dir, 'data'), 'stop', '-m', 'immediate'], { stdio: 'pipe' });
    } catch {
      /* no estaba corriendo */
    }
  }
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir);
  if (asPg) chownSync(dir, Number(execFileSync('id', ['-u', 'postgres']).toString().trim()), Number(execFileSync('id', ['-g', 'postgres']).toString().trim()));
  const run = (cmd, args) => (asPg ? execFileSync('runuser', ['-u', 'postgres', '--', cmd, ...args], { stdio: 'pipe' }) : execFileSync(cmd, args, { stdio: 'pipe' }));
  run(join(bin, 'initdb'), ['-D', join(dir, 'data'), '-U', 'postgres', '-A', 'trust']);
  // PostgreSQL como proceso hijo (no daemon): si la pila muere, la base muere con ella.
  const pgArgs = [join(bin, 'postgres'), '-D', join(dir, 'data'), '-p', String(PG_PORT), '-k', dir, '-c', 'wal_level=logical'];
  const pg = asPg ? spawn('runuser', ['-u', 'postgres', '--', ...pgArgs], { stdio: 'ignore' }) : spawn(pgArgs[0], pgArgs.slice(1), { stdio: 'ignore' });
  for (let i = 0; ; i++) {
    try {
      execFileSync(join(bin, 'pg_isready'), ['-h', dir, '-p', String(PG_PORT)], { stdio: 'pipe' });
      break;
    } catch {
      if (i > 100) throw new Error('PostgreSQL no arrancó');
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  const psql = (args) => execFileSync('psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-h', dir, '-p', String(PG_PORT), '-U', 'postgres', '-d', 'postgres', ...args], { stdio: 'pipe' }).toString();
  psql(['-f', join(ROOT, 'supabase/tests/supabase_stub.sql')]);
  psql(['-f', join(ROOT, 'supabase/migrations/0001_alignment_unblock.sql')]);
  for (const [email, rol] of members) psql(['-c', `insert into public.au_members (email, rol) values ('${email}', '${rol}')`]);

  const conf = join(dir, 'postgrest.conf');
  writeFileSync(
    conf,
    [
      `db-uri = "postgres://authenticator:authenticator@localhost:${PG_PORT}/postgres"`,
      'db-schemas = "public"',
      'db-anon-role = "anon"',
      `jwt-secret = "${JWT_SECRET}"`,
      `server-port = ${REST_PORT}`,
      'log-level = "crit"',
    ].join('\n'),
  );
  const rest = spawn(process.env.POSTGREST_BIN ?? 'postgrest', [conf], { stdio: 'ignore' });
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://localhost:${REST_PORT}/`);
      if (r.status < 500) break;
    } catch {
      /* aún no */
    }
    await new Promise((r) => setTimeout(r, 200));
  }

  const server = http.createServer((req, res) => handle(req, res).catch((e) => {
    res.writeHead(500, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ message: String(e) }));
  }));
  await new Promise((r) => server.listen(PORT, r));

  const stop = () => {
    server.close();
    rest.kill();
    try {
      run(join(bin, 'pg_ctl'), ['-D', join(dir, 'data'), 'stop', '-m', 'immediate']);
    } catch {
      pg.kill('SIGKILL');
    }
    rmSync(dir, { recursive: true, force: true });
  };
  return { url: `http://localhost:${PORT}`, anonKey: ANON_KEY, psql, stop };
}

function cors(res) {
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-headers', '*');
  res.setHeader('access-control-allow-methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('access-control-expose-headers', 'content-range, content-profile, x-total-count');
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks);
}

function session(email) {
  const now = Math.floor(Date.now() / 1000);
  const user = { id: randomUUID(), aud: 'authenticated', role: 'authenticated', email, user_metadata: {}, app_metadata: { provider: 'email' }, created_at: new Date().toISOString() };
  return {
    access_token: signJwt({ sub: user.id, email, role: 'authenticated', aud: 'authenticated', iat: now, exp: now + 3600 }),
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: now + 3600,
    refresh_token: randomUUID(),
    user,
  };
}

async function handle(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.writeHead(204).end();
  const url = new URL(req.url, 'http://x');

  if (url.pathname.startsWith('/rest/v1/')) {
    const body = await readBody(req);
    const headers = { ...req.headers };
    delete headers.host;
    const r = await fetch(`http://localhost:${REST_PORT}${url.pathname.slice(8)}${url.search}`, {
      method: req.method,
      headers,
      body: ['GET', 'HEAD'].includes(req.method) ? undefined : body,
    });
    const out = Buffer.from(await r.arrayBuffer());
    const h = {};
    r.headers.forEach((v, k) => {
      if (!['content-encoding', 'transfer-encoding', 'connection'].includes(k)) h[k] = v;
    });
    res.writeHead(r.status, h);
    return res.end(out);
  }

  const json = (status, data) => {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(data === undefined ? '' : JSON.stringify(data));
  };
  if (url.pathname === '/auth/v1/otp') return json(200, {});
  if (url.pathname === '/auth/v1/verify') {
    const { email, token } = JSON.parse((await readBody(req)).toString() || '{}');
    if (token !== OTP_CODE) return json(403, { code: 403, error_code: 'otp_expired', msg: 'Token has expired or is invalid' });
    return json(200, session(String(email).toLowerCase()));
  }
  if (url.pathname === '/auth/v1/logout') return json(204);
  if (url.pathname === '/auth/v1/user') {
    const tok = (req.headers.authorization ?? '').replace('Bearer ', '');
    const payload = JSON.parse(Buffer.from(tok.split('.')[1] ?? 'e30', 'base64url').toString());
    return json(200, { id: payload.sub, email: payload.email, aud: 'authenticated', role: 'authenticated', user_metadata: {}, app_metadata: {} });
  }
  if (url.pathname.startsWith('/realtime/')) return json(404, { message: 'Realtime no disponible en la pila local' });
  return json(404, { message: 'not found' });
}

// Ejecución directa: deja la pila corriendo.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const stack = await startStack({
    members: (process.env.STACK_MEMBERS ?? 'admin@soc.test:ADMIN,gerente@soc.test:GERENTE')
      .split(',')
      .filter(Boolean)
      .map((x) => x.split(':')),
  });
  console.log(`Pila lista en ${stack.url}\nVITE_SUPABASE_URL=${stack.url}\nVITE_SUPABASE_ANON_KEY=${stack.anonKey}\nCódigo de acceso: ${OTP_CODE}`);
  const shutdown = () => {
    stack.stop();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
