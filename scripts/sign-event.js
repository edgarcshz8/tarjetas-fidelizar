#!/usr/bin/env node
/**
 * PagoKit — sign-event.js
 * Genera eventos de webhook firmados (o manipulados) para probar el handler local.
 *
 * Uso:
 *   node scripts/sign-event.js \
 *     --provider mercadopago \
 *     --secret "$MP_WEBHOOK_SECRET" \
 *     --url "http://localhost:3000/api/webhook/mercadopago" \
 *     --mode valid \
 *     --curl
 *
 * Modos:
 *   valid   → evento correctamente firmado          → esperado 2xx
 *   forged  → firma con un carácter corrupto         → esperado 4xx
 *   replay  → timestamp 400 s atrás (ventana=300 s)  → esperado 4xx
 */

'use strict';

const { createHmac, randomUUID } = require('crypto');
const http  = require('http');
const https = require('https');
const { URL } = require('url');

// ─── CLI ──────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue;
    const key = argv[i].slice(2);
    if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
      opts[key] = argv[i + 1];
      i++;
    } else {
      opts[key] = true;
    }
  }
  return opts;
}

function die(msg) { console.error(msg); process.exit(1); }

// ─── Firma Mercado Pago ───────────────────────────────────────────────────────
// Esquema: hmac_field_concat
// Template exacto que usa route.ts:
//   "id:<data.id>;request-id:<x-request-id>;ts:<ts>;"
// Algoritmo: HMAC-SHA256(MP_WEBHOOK_SECRET, template) → hex

function buildSignedEvent(secret, mode) {
  const dataId    = String(100_000_000 + Math.floor(Math.random() * 900_000_000));
  const requestId = randomUUID();
  const nowSecs   = Math.floor(Date.now() / 1000);
  // replay: retroceder 400 s — supera la ventana de 300 s del handler
  const ts        = mode === 'replay' ? String(nowSecs - 400) : String(nowSecs);

  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  let v1 = createHmac('sha256', secret).update(manifest).digest('hex');

  if (mode === 'forged') {
    // Corromper el primer carácter — solo la verificación criptográfica puede detectarlo
    v1 = (v1[0] === 'a' ? 'b' : 'a') + v1.slice(1);
  }

  const body = JSON.stringify({
    type        : 'payment',
    action      : 'payment.created',
    data        : { id: dataId },
    date_created: new Date(Number(ts) * 1000).toISOString(),
    id          : Math.floor(Math.random() * 1e12),
    live_mode   : false,
    user_id     : '000000000',
  });

  return {
    body,
    xSignature: `ts=${ts},v1=${v1}`,
    requestId,
  };
}

// ─── HTTP ─────────────────────────────────────────────────────────────────────

function send(url, body, headers) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const lib    = parsed.protocol === 'https:' ? https : http;
    const req    = lib.request(
      {
        method  : 'POST',
        hostname: parsed.hostname,
        port    : parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
        path    : parsed.pathname + parsed.search,
        headers,
      },
      res => {
        let buf = '';
        res.on('data', c => { buf += c; });
        res.on('end',  () => resolve({ status: res.statusCode, body: buf }));
      },
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ─── Formato curl ─────────────────────────────────────────────────────────────

function toCurl(url, body, xSignature, requestId) {
  const escaped = body.replace(/'/g, "'\\''");
  return [
    `curl -s -w "\\n%{http_code}" -X POST \\`,
    `  -H "Content-Type: application/json" \\`,
    `  -H "x-signature: ${xSignature}" \\`,
    `  -H "x-request-id: ${requestId}" \\`,
    `  -d '${escaped}' \\`,
    `  "${url}"`,
  ].join('\n');
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (!opts.provider) die('Falta --provider (ej: --provider mercadopago)');
  if (!opts.secret)   die('Falta --secret (valor de MP_WEBHOOK_SECRET)');
  if (!opts.url)      die('Falta --url (ej: --url http://localhost:3000/api/webhook/mercadopago)');
  if (!opts.mode)     die('Falta --mode (valid | forged | replay)');

  if (opts.provider !== 'mercadopago') {
    console.log(`[SKIP] Provider "${opts.provider}" no es localmente signable con este script.`);
    console.log('       Usar el sandbox/CLI del proveedor para generar eventos firmados.');
    process.exit(2);
  }

  if (!['valid', 'forged', 'replay'].includes(opts.mode)) {
    die(`--mode inválido: "${opts.mode}". Opciones: valid, forged, replay.`);
  }

  const { body, xSignature, requestId } = buildSignedEvent(opts.secret, opts.mode);

  const headers = {
    'Content-Type'  : 'application/json',
    'Content-Length': String(Buffer.byteLength(body, 'utf8')),
    'x-signature'   : xSignature,
    'x-request-id'  : requestId,
  };

  if (opts.curl) {
    console.log('# curl equivalent:');
    console.log(toCurl(opts.url, body, xSignature, requestId));
    console.log('');
  }

  try {
    const { status } = await send(opts.url, body, headers);

    const pass = opts.mode === 'valid'
      ? status >= 200 && status < 300
      : status >= 400 && status < 500;

    const tag = pass ? '[PASS]' : '[FAIL]';
    const exp = opts.mode === 'valid' ? '2xx' : '4xx';
    console.log(`${tag} ${opts.mode.padEnd(7)} → HTTP ${status} (esperado ${exp})`);

    if (!pass && opts.mode !== 'valid') {
      console.error('');
      console.error('  CRÍTICO: el handler aceptó un evento que debería rechazar.');
      console.error('  Un atacante puede forjar o repetir pagos.');
    }

    process.exit(pass ? 0 : 1);
  } catch (err) {
    console.error(`[FAIL] No se pudo conectar a ${opts.url}`);
    console.error(`       ${err.message}`);
    console.error(`       Verificar que el servidor esté corriendo: npm run dev`);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('[FAIL]', err.message);
  process.exit(1);
});
