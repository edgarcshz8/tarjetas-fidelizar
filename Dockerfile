# ── Stage 1: instalar dependencias ──────────────────────────────────────────
FROM node:20-slim AS deps
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci

# ── Stage 2: compilar Next.js ────────────────────────────────────────────────
FROM node:20-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ── Stage 3: imagen de producción ───────────────────────────────────────────
FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

# Noto Color Emoji: needed by @napi-rs/canvas for emoji rendering in wallet pass strips.
RUN apt-get update && apt-get install -y --no-install-recommends fonts-noto-color-emoji \
    && rm -rf /var/lib/apt/lists/*

# node_modules completo desde deps (incluye prisma CLI, ts-node para el seed manual)
COPY --from=deps /app/node_modules ./node_modules

# App compilada
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public

# Prisma: schema + migraciones (necesario para prisma migrate deploy)
COPY prisma ./prisma

# tsconfig del seed (necesario para: npx prisma db seed)
COPY tsconfig.seed.json ./tsconfig.seed.json

# Scripts de setup (superadmin, etc.)
COPY scripts ./scripts

# Configuración de Next.js
COPY next.config.js ./next.config.js
COPY package.json ./package.json

EXPOSE 3000

# Aplica migraciones, crea el superadmin (idempotente), luego inicia la app.
CMD ["sh", "-c", "npx prisma migrate deploy && npx ts-node --project tsconfig.seed.json scripts/create-superadmin.ts && npx next start"]
