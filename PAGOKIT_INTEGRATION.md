# PagoKit Integration

Generado por PagoKit el 2026-11-12.

## Configuración

| Campo | Valor |
|---|---|
| Provider | Mercado Pago (API v2) |
| SDK | `mercadopago@^2.4.0` |
| Stack | Next.js 14 App Router + TypeScript |
| ORM | Prisma 5 + PostgreSQL |
| Deploy target | — (sin proveedor específico) |
| Billing mode | subscription |
| Frontend style | bricks (MP Payment Brick) |
| Moneda | CLP (cero decimales) |

## Archivos generados

| Archivo | Propósito |
|---|---|
| `src/app/api/checkout/route.ts` | Crea una preferencia de pago en MP y devuelve el `preferenceId` + `initPoint` |
| `src/app/api/webhook/mercadopago/route.ts` | Webhook handler con verificación HMAC-SHA256, dedup por event_id, re-fetch del pago |
| `src/app/[slug]/subscribe/page.tsx` | Página de suscripción con MP Payment Brick |
| `src/lib/payments/errors.ts` | Tipos de error tipados, `normalizeMpStatus()` |
| `prisma/schema.prisma` | Modelos `Plan`, `Subscription`, `WebhookEvent` agregados al schema existente |
| `.env.example` | Variables de entorno MP (solo prefijos TEST-) |
| `payment-page-scripts.json` | Inventario PCI DSS 4.0.1 req. 6.4.3 de scripts en páginas de pago |
| `PAGOKIT_INTEGRATION.md` | Este archivo |
| `PAGOKIT_PRODUCTION_CHECKLIST.md` | Checklist antes de ir a producción |

## Modelos Prisma agregados

### `Plan`
Planes de suscripción disponibles (nombre, precio en CLP, intervalo).

### `Subscription`
Suscripción activa de cada `Business`. Campos relevantes:
- `status`: `PENDING | ACTIVE | PAST_DUE | CANCELED | PAUSED`
- `mpSubscriptionId`: ID de la preferencia o pago en MP
- `mpPreapprovalId`: ID del preapproval (para suscripciones recurrentes nativas de MP)
- `currentPeriodStart / currentPeriodEnd`: período activo

### `WebhookEvent`
Tabla de deduplicación. Almacena el `x-request-id` de cada webhook recibido.
El campo `eventId` tiene constraint `UNIQUE` — un segundo intento de inserción falla,
detectando el replay y retornando 200 sin reprocesar.

## Webhook — eventos manejados

| Estado | Evento | Handler |
|---|---|---|
| Implementado | `payment` | Re-fetch via `GET /v1/payments/{id}`, actualiza `Subscription` si `status == approved` |
| Implementado | `subscription_authorized_payment` | Igual que `payment`, para cobros recurrentes |
| TODO | `subscription_preapproval` | Ver `src/app/api/webhook/mercadopago/route.ts` — buscar comentario `TODO: subscription_preapproval` |

Todos los eventos no reconocidos son logueados con un comentario `TODO` — nunca se descartan silenciosamente.

## Webhooks existentes detectados al instalar

| Ruta | Integración |
|---|---|
| `src/app/api/passes/apple/v1/devices/[deviceId]/registrations/[passTypeId]/route.ts` | Apple PassKit (Wallet) |
| `src/app/api/passes/apple/v1/devices/[deviceId]/registrations/[passTypeId]/[serial]/route.ts` | Apple PassKit (Wallet) |
| `src/app/api/passes/apple/v1/passes/[passTypeId]/[serial]/route.ts` | Apple PassKit (Wallet) |
| `src/app/api/passes/apple/v1/log/route.ts` | Apple PassKit (Wallet) |
| `src/app/api/notifications/birthday/route.ts` | Cron de cumpleaños interno |

El webhook de MP se colocó en `/api/webhook/mercadopago/` sin tocar ninguna ruta existente (Rule 7).

## Tarjetas de prueba (Mercado Pago — Chile)

| Escenario | Número | CVV | Vencimiento |
|---|---|---|---|
| Pago aprobado | `4509 9535 6623 3704` | `123` | Cualquier fecha futura |
| Pago rechazado | `4000 0000 0000 0002` | `123` | Cualquier fecha futura |
| Fondos insuficientes | `4551 7422 1482 7060` | `123` | Cualquier fecha futura |
| Pendiente (revisión manual) | `4514 1021 7719 0334` | `123` | Cualquier fecha futura |

Usar **usuario de prueba** de MP para los pagos en sandbox. Crear en:
`POST https://api.mercadopago.com/users/test` con el access token de test.

## Variables de entorno requeridas

```bash
# Copiar desde .env.example y reemplazar con tus credenciales TEST
MP_ACCESS_TOKEN=TEST-...
MP_PUBLIC_KEY=TEST-...
MP_WEBHOOK_SECRET=TEST-...
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_MP_PUBLIC_KEY=TEST-...   # para el brick en frontend
```

Nota: `NEXT_PUBLIC_MP_PUBLIC_KEY` debe agregarse al `.env.local` además de `MP_PUBLIC_KEY`,
ya que el brick la consume en el cliente.

## Próximos pasos

1. Copiar `.env.example` a `.env.local` y completar con tus credenciales TEST de MP.
2. Agregar `NEXT_PUBLIC_MP_PUBLIC_KEY=TEST-...` a `.env.local` (igual que `MP_PUBLIC_KEY`).
3. Ejecutar la migración de Prisma:
   ```bash
   npx prisma migrate dev --name add_subscriptions_and_webhook_events
   ```
4. Crear al menos un registro en la tabla `plans` (vía Prisma Studio o seed).
5. Configurar el webhook en el dashboard de MP:
   - URL: `https://tu-dominio.com/api/webhook/mercadopago`
   - Eventos: `payment`, `subscription_authorized_payment`, `subscription_preapproval`
   - Copiar el secreto generado a `MP_WEBHOOK_SECRET` en tus variables de entorno.
6. Ejecutar `/pagokit:test` para enviar un evento de prueba firmado al webhook local.
7. Cuando el sandbox funcione, ver `PAGOKIT_PRODUCTION_CHECKLIST.md`.

## Referencias

- Docs de Mercado Pago: https://www.mercadopago.cl/developers/es/docs
- Webhooks MP: https://www.mercadopago.cl/developers/es/docs/your-integrations/notifications/webhooks
- MP Bricks: https://www.mercadopago.cl/developers/es/docs/checkout-bricks/payment-brick/introduction
- PCI DSS 4.0.1 req. 6.4.3 (scripts en páginas de pago): inventario en `/payment-page-scripts.json`
- Reglas de seguridad PagoKit: `SECURITY_RULES.md`

---

_Información verificada al 2026-11-12. Las tarifas y disponibilidad de productos de Mercado Pago pueden cambiar. Verificar siempre en el dashboard oficial._
