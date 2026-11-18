# PagoKit Integration

Generado por PagoKit el 2026-11-18.

## Configuracion

| Campo               | Valor                                      |
|---------------------|--------------------------------------------|
| Provider            | Mercado Pago — preapproval (suscripciones) |
| SDK                 | `mercadopago@^2.13.0` (ya instalado)       |
| Stack               | Next.js 14 App Router                      |
| ORM                 | Prisma 5                                   |
| Deploy target       | Dokploy (Docker self-hosted)               |
| Billing mode        | subscription_preapproval                   |
| Frontend style      | Hosted checkout (redirect a init_point MP) |
| Moneda              | CLP (zero-decimal — Rule 6)                |
| Monto de ejemplo    | $29.990 CLP                                |

## Archivos generados

| Archivo                                                                 | Proposito                                                                   |
|-------------------------------------------------------------------------|-----------------------------------------------------------------------------|
| `prisma/schema.prisma`                                                  | Modelos Plan, Subscription, WebhookEvent agregados; relacion en Business    |
| `prisma/migrations/20261118000000_add_subscription_plans/migration.sql` | Migracion SQL lista para `prisma migrate deploy`                            |
| `src/lib/payments/errors.ts`                                            | Tipos de error de pago (pure-data, sin efectos)                             |
| `src/app/api/webhook/mercadopago/route.ts`                              | Webhook handler con verificacion de firma HMAC-SHA256                       |
| `src/app/api/subscriptions/checkout/route.ts`                          | POST — crea preapproval_plan + preapproval en MP, devuelve init_point       |
| `src/app/api/admin/subscription/route.ts`                              | GET estado / DELETE cancelar suscripcion                                    |
| `src/app/admin/subscription/page.tsx`                                   | Server component — lista de planes con precios en CLP                       |
| `src/app/admin/subscription/_components/SubscriptionPlans.tsx`          | Client component — botones de suscripcion, redireccion a MP                 |
| `src/app/admin/subscription/success/page.tsx`                           | Landing post-redirect desde MP                                              |
| `.env.example`                                                          | Variables MP agregadas (prefijos TEST, nunca live — Rule 8)                 |

## Eventos webhook ruteados

| Evento                                   | Estado                                                                   |
|------------------------------------------|--------------------------------------------------------------------------|
| `subscription_preapproval.authorized`    | Suscripcion → ACTIVE                                                    |
| `subscription_preapproval.paused`        | Suscripcion → PAST_DUE                                                  |
| `subscription_preapproval.pending`       | Suscripcion → PAST_DUE                                                  |
| `subscription_preapproval.cancelled`     | Suscripcion → CANCELLED, canceledAt = now()                             |
| `subscription_authorized_payment.payment.created` | Extiende currentPeriodEnd, Suscripcion → ACTIVE             |
| `subscription_authorized_payment.payment.updated` | Extiende currentPeriodEnd, Suscripcion → ACTIVE             |

## Webhooks existentes detectados al momento de la instalacion

- `src/app/api/notifications/birthday/route.ts` — cron de notificaciones push de cumpleanos (no MP)
- Ninguno en conflicto con `/api/webhook/mercadopago/`

## Variables de entorno requeridas

```
MP_ACCESS_TOKEN      # Access token de TEST/Live (ver .env.example)
MP_PUBLIC_KEY        # Public key de TEST/Live
MP_WEBHOOK_SECRET    # Secret del endpoint de webhook registrado en MP Dashboard
APP_URL              # URL base (ej: https://tuapp.com) — usada para back_url
```

## Notas de seguridad (SECURITY_RULES)

- **Rule 1**: La firma HMAC-SHA256 se verifica ANTES de parsear el body del webhook.
- **Rule 2**: Se rechaza cualquier evento con timestamp fuera de ±5 minutos.
- **Rule 3**: Idempotencia en checkout con `crypto.randomUUID()`. Deduplicacion de webhooks con `WebhookEvent.mpEventId` (UNIQUE constraint).
- **Rule 6**: CLP es zero-decimal. `transaction_amount: 29990` — NUNCA `29990 * 100`.
- **Rule 8**: El webhook loguea solo `id`, `type`, `created`. Nunca el payload completo. `.env.example` usa prefijos TEST.
- **Rule 9**: La firma se verifica con `MP_WEBHOOK_SECRET`, no con el access token.
- **Rule 10**: Las firmas se comparan con `timingSafeEqual` del modulo `crypto` nativo de Node. NUNCA `===`.
- **Rule 11**: Minimo PII. El payer_email proviene de la sesion autenticada, no del body del request. No se almacena ni loguea informacion de tarjeta.
- **Rule 12**: Sin almacenamiento de CVV, PAN ni track data en ningun archivo.

## Tarjetas de prueba (CLP — Mercado Pago Chile)

| Escenario   | Tarjeta            | CVV | Vencimiento |
|-------------|--------------------|-----|-------------|
| Aprobado    | 5031 7557 3453 0604 | 123 | 11/25       |
| Rechazado   | 4013 5406 8274 6260 | 123 | 11/25       |
| 3DS         | 5254 1336 7440 3498 | 123 | 11/25       |

Referencia completa: https://www.mercadopago.cl/developers/es/docs/checkout-api/integration-test/test-cards

## Proximos pasos

1. Copia `.env.example` a `.env.local` y completa las credenciales TEST de tu app en el panel de MP.
2. La migracion se aplica automaticamente en el proxismo deploy via `scripts/start.sh` → `prisma migrate deploy`.
   Para aplicarla localmente sin deploy: `npx prisma migrate deploy` (no `migrate dev`).
3. Registra el endpoint de webhook en el panel de MP apuntando a `https://<tuapp>/api/webhook/mercadopago/`
   y suscribete a los eventos `subscription_preapproval` y `subscription_authorized_payment`.
4. Crea al menos un Plan en la base de datos (puede ser via `prisma studio` en desarrollo).
5. Accede a `/admin/subscription` para ver los planes y probar el flujo.
6. Verifica que el webhook dispara correctamente usando el simulador del panel de MP.
7. Cuando estes listo para produccion, lee `PAGOKIT_PRODUCTION_CHECKLIST.md`.

## Referencias

- Documentacion MP Suscripciones: https://www.mercadopago.cl/developers/es/docs/subscriptions/landing
- Documentacion webhook MP: https://www.mercadopago.cl/developers/es/docs/your-integrations/notifications/webhooks
- PagoKit security rules: ver comentarios `// SECURITY_RULES` en cada archivo generado

---
_Verificado el 2026-11-18. Las tarifas y disponibilidad de productos de Mercado Pago pueden cambiar._

> **Nota regulatoria (Rule 11 — Chile):** Esta integracion procesa pagos de negocios chilenos en CLP.
> Mercado Pago actua como Merchant of Record para los pagos en Chile. El SaaS B2B debe emitir
> boletas o facturas electronicas (DTE) por las suscripciones cobradas a los negocios clientes,
> de acuerdo con la normativa del SII (Servicio de Impuestos Internos de Chile).
> Consulta a tu contador para la correcta emision de DTE via facturador electronico.
