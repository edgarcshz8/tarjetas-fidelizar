# Checklist de Producción — Mercado Pago

Antes de activar el modo producción, completa cada ítem de esta lista.
PagoKit te configuró para sandbox; el paso a producción es **intencionalmente manual**.

---

## 1. Reemplazar claves de test por claves de producción

- [ ] En el dashboard de MP, ir a **Tu aplicación → Credenciales → Producción**.
- [ ] Generar y copiar las credenciales de **producción**.
- [ ] Reemplazar en tu plataforma de deploy (NO en `.env.example`):
  - `MP_ACCESS_TOKEN` → valor que comienza con `APP_USR-` (producción)
  - `MP_PUBLIC_KEY` → valor que comienza con `APP_USR-` (producción)
  - `NEXT_PUBLIC_MP_PUBLIC_KEY` → mismo valor que `MP_PUBLIC_KEY`

> Las claves de producción de MP comienzan con `APP_USR-`, no con `TEST-`.
> NUNCA commitear estas claves — usar el gestor de secretos de tu plataforma de deploy.

---

## 2. Configurar el endpoint de webhook en producción

- [ ] En el dashboard de MP: **Tu aplicación → Webhooks → Agregar URL**.
- [ ] URL del endpoint: `https://TU_DOMINIO/api/webhook/mercadopago`
- [ ] Suscribirse a los eventos:
  - `payment`
  - `subscription_authorized_payment`
  - `subscription_preapproval`
- [ ] Copiar el **secreto de firma** generado y guardarlo como `MP_WEBHOOK_SECRET` en tus secretos de producción.

> El secreto de webhook es **distinto** al access token. Se genera una vez por endpoint configurado.

---

## 3. Variables de entorno en producción

Según tu plataforma de deploy, establece las siguientes variables de entorno en modo producción:

### Docker / Dokploy (el deploy target de este proyecto)

En el panel de Dokploy, ir a la aplicación → Variables de entorno y agregar:

```
MP_ACCESS_TOKEN=APP_USR-...
MP_PUBLIC_KEY=APP_USR-...
NEXT_PUBLIC_MP_PUBLIC_KEY=APP_USR-...
MP_WEBHOOK_SECRET=<secreto del endpoint de webhook>
```

### Vercel (si migras en el futuro)

```bash
vercel env add MP_ACCESS_TOKEN production
vercel env add MP_PUBLIC_KEY production
vercel env add NEXT_PUBLIC_MP_PUBLIC_KEY production
vercel env add MP_WEBHOOK_SECRET production
```

### Railway

```bash
railway variables set MP_ACCESS_TOKEN=APP_USR-...
railway variables set MP_PUBLIC_KEY=APP_USR-...
railway variables set NEXT_PUBLIC_MP_PUBLIC_KEY=APP_USR-...
railway variables set MP_WEBHOOK_SECRET=...
```

---

## 4. Ejecutar la migración de base de datos en producción

- [ ] Conectar a la base de datos de producción.
- [ ] Ejecutar:
  ```bash
  npx prisma migrate deploy
  ```
  Este comando aplica todas las migraciones pendientes sin modo interactivo.
- [ ] Verificar que las tablas `plans`, `subscriptions` y `webhook_events` existen.
- [ ] Crear al menos un registro en la tabla `plans` con el precio real en CLP.

---

## 5. Revisión PCI DSS 4.0.1 req. 6.4.3

- [ ] Revisar `/payment-page-scripts.json` y confirmar que todos los scripts listados siguen siendo necesarios.
- [ ] Verificar que no se agregaron scripts nuevos en las páginas de pago sin actualizar el inventario.
- [ ] Actualizar el campo `_last_reviewed` y `_reviewed_by` con la fecha y tu email.
- [ ] Si Mercado Pago publica hashes SRI para su SDK, agregarlos al campo `integrity`.

---

## 6. Activar cuenta de producción en Mercado Pago

- [ ] Completar el proceso de **homologación** de MP si aplica para tu país/volumen.
- [ ] Verificar que tu cuenta tenga habilitados los métodos de pago necesarios (tarjetas de crédito/débito Chile).
- [ ] Si cobras en CLP: confirmar que CLP está habilitado como moneda en tu cuenta.
- [ ] Revisar las comisiones vigentes de MP Chile:
  https://www.mercadopago.cl/ayuda/costos-de-usar-mercado-pago_1_1

---

## 7. Implementar el evento TODO antes de producción

- [ ] El evento `subscription_preapproval` está marcado como TODO en el webhook.
  Ubicación: `src/app/api/webhook/mercadopago/route.ts` — buscar `TODO: subscription_preapproval`.
  Este evento notifica cambios de estado en suscripciones recurrentes (cancelación, pausa).
  **Implementar antes de exponer a usuarios reales.**

---

## 8. Prueba de sanidad final en producción

- [ ] Hacer un cobro real de $1 (CLP) desde un dispositivo diferente.
- [ ] Confirmar que el webhook recibió el evento `payment` y lo logueó correctamente.
- [ ] Verificar que el estado de la `Subscription` en la DB cambió a `ACTIVE`.
- [ ] Emitir un reembolso desde el dashboard de MP.
- [ ] Confirmar que el webhook recibió el evento y la DB se actualizó.

---

## 9. Monitoreo

- [ ] Configurar una alerta en el dashboard de MP para rechazos de pago inusuales.
- [ ] Monitorear los logs de la aplicación durante las primeras 24 horas en producción.
- [ ] Revisar la tabla `webhook_events` periódicamente para detectar replays inesperados.

---

## Nota legal / regulación regional

Este proyecto procesa pagos en Chile (CLP). Aplican las siguientes regulaciones:

- **Ley 19.628** (Protección de la vida privada / datos personales): recolectar solo el
  mínimo de PII necesario. La integración cumple con Rule 11 — solo nombre y email del pagador.
- **CMF Chile**: si el volumen de transacciones supera ciertos umbrales, puede requerirse
  inscripción como operador de pagos. Consultar con un asesor legal.
- **IVA en servicios digitales**: los servicios SaaS en Chile están afectos a IVA (19%).
  Verificar obligaciones de facturación electrónica (DTE / boleta).
- Mercado Pago actúa como intermediario de pagos; los datos de tarjeta son tratados
  por MP bajo su propio esquema PCI DSS. Esta integración no almacena PAN, CVV ni track data (Rule 12).

---

_Generado por PagoKit el 2026-11-12. Revisar ante cambios en la API de Mercado Pago o en la regulación local._
