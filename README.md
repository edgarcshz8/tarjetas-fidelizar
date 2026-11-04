# Tarjetas de Fidelización

Sistema SaaS de tarjetas de fidelización compatibles con **Apple Wallet** y **Google Wallet**.

## Stack

- **Next.js 14** (App Router) + TypeScript
- **PostgreSQL** + Prisma ORM
- **Apple Wallet**: `passkit-generator` + APNS push
- **Google Wallet**: REST API + JWT
- **Auth**: NextAuth.js (sesiones JWT)
- **Estilos**: Tailwind CSS

---

## Flujo del sistema

```
Cliente escanea QR del local
        ↓
/{slug} → formulario (nombre, email, teléfono)
        ↓
Backend crea CustomerPass
  ├── Genera .pkpass (Apple Wallet)
  └── Crea LoyaltyObject (Google Wallet)
        ↓
Cliente descarga su tarjeta
        ↓
Comerciante abre /admin/scanner
  → Escanea QR del pase del cliente
  → POST /api/stamp → suma 1 sello
  → Si alcanza N sellos → rewardReady = true
  → POST /api/redeem → canjea premio, resetea sellos
```

---

## Setup rápido

### 1. Instalar dependencias

```bash
npm install
```

### 2. Variables de entorno

```bash
cp .env.example .env
# Editar .env con tus valores
```

### 3. Base de datos

```bash
# Con PostgreSQL local corriendo:
npm run db:push

# Cargar datos de prueba:
npm run db:seed
```

### 4. Desarrollo

```bash
npm run dev
# → http://localhost:3000
```

**Credenciales de prueba** (tras el seed):
- Panel admin: `http://localhost:3000/admin/login`
- Email: `admin@democafe.com` / Contraseña: `admin123`
- Página de registro: `http://localhost:3000/demo-cafe`

---

## Configuración de Apple Wallet

Requiere cuenta de **Apple Developer** ($99/año).

### 1. Crear Pass Type ID

1. Ir a [Apple Developer → Certificates](https://developer.apple.com/account/resources/certificates/list)
2. Identifiers → Pass Type IDs → "+"
3. Crear ID: `pass.com.tuempresa.fidelizar`
4. Generar certificado para ese Pass Type ID

### 2. Exportar certificados

```bash
# Exportar .p12 desde Keychain Access
# Luego convertir a PEM:

openssl pkcs12 -in Certificates.p12 -clcerts -nokeys -out certs/signerCert.pem
openssl pkcs12 -in Certificates.p12 -nocerts -nodes -out certs/signerKey.pem

# Descargar WWDR G4 de Apple:
# https://www.apple.com/certificateauthority/
# Guardar como certs/wwdr.pem
```

### 3. Para push updates (APNS)

1. En Apple Developer → Keys → "+" → Apple Push Notifications service (APNs)
2. Descargar `.p8` → guardar como `certs/apn_key.p8`
3. Anotar el Key ID

---

## Configuración de Google Wallet

### 1. Google Cloud Console

1. Crear proyecto en [console.cloud.google.com](https://console.cloud.google.com)
2. Habilitar **Google Wallet API**
3. Crear Service Account → descargar JSON de credenciales → guardar como `certs/google-service-account.json`

### 2. Google Pay & Wallet Console

1. Ir a [pay.google.com/business/console](https://pay.google.com/business/console)
2. Inscribirse como emisor
3. Anotar el **Issuer ID** (número largo)

---

## Estructura del proyecto

```
src/
├── app/
│   ├── [slug]/          # Página de registro del cliente
│   ├── admin/           # Panel del comerciante
│   │   ├── dashboard/   # Estadísticas + QR del local
│   │   ├── scanner/     # Escanear tarjeta del cliente
│   │   ├── customers/   # Lista de clientes
│   │   └── settings/    # Configurar programa
│   └── api/
│       ├── register/    # Registro de cliente + generación de pases
│       ├── stamp/       # Agregar sello
│       ├── redeem/      # Canjear premio
│       └── passes/
│           ├── apple/   # PassKit web service (Apple Wallet spec)
│           └── google/  # Google Wallet
├── components/
│   ├── AdminNav.tsx
│   ├── QRScannerClient.tsx
│   └── SettingsForm.tsx
└── lib/
    ├── passkit.ts       # Generación de .pkpass
    ├── google-wallet.ts # Google Wallet API
    ├── apns.ts          # Push notifications Apple
    ├── auth.ts          # NextAuth config
    ├── prisma.ts        # Cliente Prisma
    └── qr.ts            # Generación de QR codes
```

---

## Modelo de datos

| Tabla | Descripción |
|---|---|
| `businesses` | Negocios (tenants) con slug único |
| `loyalty_programs` | Configuración del programa (N sellos → premio) |
| `customers` | Clientes registrados |
| `customer_passes` | Pase individual por cliente/programa |
| `stamps` | Historial de sellos por pase |
| `apple_devices` | Dispositivos registrados para push de Apple |
| `users` | Comerciantes con acceso al panel |

---

## Agregar nuevos negocios

Actualmente se hace por base de datos o seed. Para productización, implementar:

1. `POST /api/admin/businesses` para crear negocio (registro público)
2. Sistema de onboarding con creación de usuario OWNER
3. Pasarela de pago para suscripción SaaS

---

## Notas de producción

- Configurar `APP_URL` con el dominio real (requerido por Apple Wallet para push)
- Apple Wallet requiere **HTTPS** para el `webServiceURL`
- Usar un servicio de almacenamiento (S3/Cloudflare R2) para imágenes de iconos
- Configurar un cron job para limpiar passes de dispositivos desregistrados
