FROM node:24-slim AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@10.30.0 --activate

WORKDIR /app

# ------- Dependências de Build -------
FROM base AS deps
COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma/
RUN pnpm install --frozen-lockfile

# ------- Build -------
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Gera para o build compilar sem erro de tipo
RUN pnpm prisma generate
RUN pnpm run build
# O seu comando de cópia de segurança
RUN cp -r src/generated dist/generated || true

# ------- Production -------
    FROM base AS production
    ENV NODE_ENV=production
    WORKDIR /app
    
    RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
    
    COPY package.json pnpm-lock.yaml ./
    COPY prisma ./prisma/
    
    # Instala as dependências de produção
    RUN pnpm install --frozen-lockfile --prod --ignore-scripts
    
    # 1. Usamos 'pnpm dlx' para baixar e executar a CLI do Prisma de forma isolada
    # Isso evita o erro de "prisma not found"
    RUN pnpm dlx prisma generate
    
    # 2. Copia o código compilado do estágio de build
    COPY --from=build /app/dist ./dist
    
    EXPOSE 3333
    CMD ["node", "dist/index.js"]