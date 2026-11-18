# Checklist de Produccion — Mercado Pago Suscripciones

Antes de activar las credenciales de produccion, completa cada item. PagoKit te configuro
para sandbox; la transicion a live es intencionalmente manual para que puedas validar cada paso.

---

## 1. Reemplazar credenciales TEST por credenciales de produccion

- [ ] En el panel de Mercado Pago (https://www.mercadopago.cl/developers/panel/app),
      selecciona tu aplicacion y cambia al modo **Produccion**.
- [ ] Copia el **Access Token de produccion** (comienza con `APP_USR-...`).
- [ ] Copia el **Public Key de produccion** (comienza con `APP_USR-...`).
- [ ] En tu gestor de secretos de Dokploy (o en las variables de entorno del contenedor),
      reemplaza:
      ```
      MP_ACCESS_TOKEN=APP_USR-<tu-access-token-live>
      MP_PUBLIC_KEY=APP_USR-<tu-public-key-live>
      ```
      **NUNCA** escribas las credenciales live en `.env.example` ni las commits al repositorio.

---

## 2. Registrar el endpoint de webhook en el panel de MP (modo produccion)

- [ ] En el panel de MP → tu app → **Webhooks** → Agregar URL de produccion:
      ```
      https://<tu-dominio-de-produccion>/api/webhook/mercadopago/
      ```
- [ ] Suscribete a los eventos:
      - `subscription_preapproval`
      - `subscription_authorized_payment`
- [ ] MP generara un nuevo **Webhook Secret** para el endpoint de produccion.
- [ ] Copia ese secret y configura en Dokploy:
      ```
      MP_WEBHOOK_SECRET=<nuevo-secret-de-produccion>
      ```
- [ ] Verifica que el endpoint de produccion responda 200 usando el simulador del panel de MP.

---

## 3. Configurar variables de entorno en Dokploy

En el panel de Dokploy, agrega o actualiza las siguientes variables de entorno para tu
contenedor de produccion:

```
MP_ACCESS_TOKEN=APP_USR-<live>
MP_PUBLIC_KEY=APP_USR-<live>
MP_WEBHOOK_SECRET=<live-webhook-secret>
APP_URL=https://<tu-dominio-de-produccion>
NEXT_PUBLIC_APP_URL=https://<tu-dominio-de-produccion>
```

---

## 4. Verificar SSL / HTTPS

- [ ] Tu dominio de produccion DEBE servir via HTTPS. Mercado Pago rechaza back_url y
      webhook endpoints sin SSL.
- [ ] Verifica con: `curl -I https://<tu-dominio>/api/webhook/mercadopago/`
      Debe responder (aunque sea 405 por GET, no 000 ni error de certificado).

---

## 5. Verificar la migracion de base de datos

- [ ] El script `scripts/start.sh` corre `prisma migrate deploy` al iniciar el contenedor.
      Confirma que la migracion `20261118000000_add_subscription_plans` aparece en
      la tabla `_prisma_migrations` con `finished_at` no nulo:
      ```sql
      SELECT migration_name, finished_at FROM _prisma_migrations
      WHERE migration_name LIKE '%subscription%';
      ```
- [ ] Verifica que las tablas `plans`, `subscriptions`, `webhook_events` existen en produccion.
- [ ] Crea al menos un registro en la tabla `plans` con el precio correcto en CLP.

---

## 6. Crear planes en la base de datos de produccion

Los planes no se crean automaticamente. Debes insertarlos manualmente o via seed:

```sql
INSERT INTO plans (id, name, description, price, interval, features, "isActive", "createdAt", "updatedAt")
VALUES (
  gen_random_uuid()::text,
  'Plan Basico',
  'Para negocios pequenos',
  29990,
  'MONTHLY',
  '["Hasta 500 clientes", "Apple Wallet", "Google Wallet"]'::jsonb,
  true,
  NOW(),
  NOW()
);
```

Ajusta el precio y features segun tu estructura de planes final.

---

## 7. Email del pagador y entornos de prueba

> **Importante — error "Payer is associated with a different site"**
>
> Mercado Pago valida que el `payer_email` pertenezca a una cuenta del mismo país
> que el vendedor (sitio MLC = Chile).
>
> - **Con `MP_ACCESS_TOKEN=TEST-...` (sandbox):** el email del pagador DEBE ser el
>   de un **usuario de prueba comprador** creado para Chile (MLC).
>   Créalo en: Developers → tu app → Cuentas de prueba → Crear cuenta →
>   País: Chile → Rol: Comprador.
>   El email tendrá la forma `test_user_XXXXXXXXX@testuser.com`.
>
> - **Con `MP_ACCESS_TOKEN=APP_USR-...` (producción):** el email del pagador DEBE ser
>   el de una cuenta MP chilena real distinta a la cuenta vendedora.
>   El flujo de checkout usa el email que el usuario ingresa en el campo
>   "Email de tu cuenta Mercado Pago" en la pantalla de suscripción.
>
> Si el email no coincide con el sitio, la API responde 400 y la app muestra:
> "El email ingresado no corresponde a una cuenta de Mercado Pago Chile."

---

## 8. Prueba de sanidad en produccion

- [ ] Con credenciales live, abre `/admin/subscription` en produccion.
- [ ] Inicia un flujo de suscripcion con una tarjeta real (monto minimo recomendado: $1 o
      el minimo que permita MP en Chile, generalmente $50 CLP).
- [ ] Confirma que el webhook `subscription_preapproval.authorized` llega a tu endpoint y
      la tabla `subscriptions` actualiza el status a `ACTIVE`.
- [ ] Confirma que `webhook_events` tiene el registro del evento (deduplicacion activa).
- [ ] Cancela la suscripcion via `/api/admin/subscription` (DELETE) y confirma que MP la
      marca como cancelada en el panel.

---

## 9. Monitoreo post-lanzamiento

- [ ] Configura una alerta en el panel de MP para fallos de cobro recurrente.
- [ ] Revisa los logs del contenedor las primeras 24 horas buscando:
      - `[webhook:mp] id=...` — cada evento procesado
      - `[webhook:mp] unhandled event` — tipos no manejados (considera suscribirlos)
      - Errores de `[subscriptions:checkout]` o `[admin:subscription:delete]`
- [ ] Verifica que la tabla `webhook_events` crece con cada evento y no hay duplicados
      (si hubiera, el UNIQUE constraint los rechaza — revisa logs).

---

## 10. Consideraciones legales (Chile — Rule 11)

- [ ] Emite **boletas o facturas electronicas (DTE)** por cada suscripcion cobrada a los
      negocios clientes, segun normativa del SII.
- [ ] Si tu SaaS supera los umbrales de facturacion del SII, verifica obligaciones de
      facturador electronico autorizado (FEA).
- [ ] Mercado Pago actua como procesador de pago; tu eres el emisor del servicio y eres
      responsable de los documentos tributarios.
- [ ] Revisa los Terminos y Condiciones de MP para suscripciones en Chile:
      https://www.mercadopago.cl/ayuda

---

## 11. Checklist final antes de publicar

- [ ] `.env.example` NO contiene credenciales live (solo prefijos TEST/placeholders).
- [ ] `.gitignore` cubre `.env` y `.env.local`.
- [ ] El endpoint de webhook responde 200 en produccion.
- [ ] La firma HMAC-SHA256 se verifica correctamente (prueba con el simulador de MP).
- [ ] Los planes existen en la base de datos de produccion.
- [ ] SSL activo en el dominio.
- [ ] Primera suscripcion real procesada y confirmada via webhook.
