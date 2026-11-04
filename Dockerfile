# ── Stage 1: instalar dependencias ──────────────────────────────────────────
# Se copia prisma/schema.prisma antes de npm ci para que el postinstall
# (prisma generate) pueda generar el cliente sin errores.
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci

# ── Stage 2: compilar Next.js ────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ── Stage 3: imagen de producción ───────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# node_modules completo desde deps (incluye prisma CLI, ts-node para el seed manual)
COPY --from=deps /app/node_modules ./node_modules

# App compilada
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public

# Prisma: schema + migraciones (necesario para prisma migrate deploy)
COPY prisma ./prisma

# tsconfig del seed (necesario para: npx prisma db seed)
COPY tsconfig.seed.json ./tsconfig.seed.json

# Configuración de Next.js
COPY next.config.js ./next.config.js
COPY package.json ./package.json

EXPOSE 3000

# Aplica migraciones pendientes al arrancar, luego inicia la app.
# prisma migrate deploy es idempotente: si no hay migraciones pendientes, no hace nada.
CMD ["sh", "-c", "npx prisma migrate deploy && npx next start"]
