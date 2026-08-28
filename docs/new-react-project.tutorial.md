# Full-Stack TypeScript Project Setup

> Production-ready monorepo with Turborepo, React/Vite, NestJS, and modern tooling

## Table of Contents

1. [Project Structure](#1-project-structure)
2. [Initial Setup](#2-initial-setup)
3. [Turborepo Configuration](#3-turborepo-configuration)
4. [Shared Package](#4-shared-package)
5. [UI Package (shadcn + Tailwind v4)](#5-ui-package-shadcn--tailwind-v4)
6. [Backend (NestJS)](#6-backend-nestjs)
7. [Frontend (React + Vite)](#7-frontend-react--vite)
8. [Orval API Client Generation](#8-orval-api-client-generation)
9. [TanStack Integration](#9-tanstack-integration)
10. [Docker Development](#10-docker-development)
11. [Authentication](#11-authentication)
12. [Troubleshooting](#12-troubleshooting)

---

## 1. Project Structure

```
my-app/
├── apps/
│   ├── api/                    # NestJS backend
│   │   ├── src/
│   │   │   ├── common/         # Guards, decorators, filters, pipes
│   │   │   ├── config/         # Configuration modules
│   │   │   ├── database/       # Migrations, seeds
│   │   │   └── modules/        # Feature modules
│   │   │       ├── auth/
│   │   │       ├── users/
│   │   │       └── [feature]/
│   │   ├── test/
│   │   └── package.json
│   │
│   └── web/                    # React + Vite frontend
│       ├── app/
│       │   ├── components/
│       │   ├── hooks/
│       │   ├── lib/
│       │   ├── routes/         # TanStack Router file-based routes
│       │   └── styles/
│       ├── public/
│       └── package.json
│
├── packages/
│   ├── shared/                 # Shared types, enums, constants
│   │   ├── src/
│   │   │   ├── types/
│   │   │   ├── constants/
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── ui/                     # shadcn/ui component library
│   │   ├── src/
│   │   │   ├── components/
│   │   │   ├── lib/
│   │   │   └── styles/
│   │   └── package.json
│   │
│   └── config/                 # Shared ESLint, TypeScript configs
│       ├── eslint/
│       └── typescript/
│
├── docker/
│   └── docker-compose.yml
│
├── turbo.json
├── pnpm-workspace.yaml
└── package.json
```

---

## 2. Initial Setup

### Create Project

```bash
mkdir my-app && cd my-app
pnpm init

# Create workspace file
cat > pnpm-workspace.yaml << 'EOF'
packages:
  - "apps/*"
  - "packages/*"
EOF
```

### Root package.json

```json
{
  "name": "my-app",
  "private": true,
  "scripts": {
    "dev": "turbo dev",
    "build": "turbo build",
    "lint": "turbo lint",
    "typecheck": "turbo typecheck",
    "test": "turbo test",
    "clean": "turbo clean && rm -rf node_modules",
    "db:migrate": "pnpm --filter api db:migrate",
    "db:seed": "pnpm --filter api db:seed",
    "db:generate": "pnpm --filter api db:generate",
    "docker:up": "docker compose -f docker/docker-compose.yml up -d",
    "docker:down": "docker compose -f docker/docker-compose.yml down"
  },
  "devDependencies": {
    "turbo": "^2.3.0",
    "typescript": "^5.7.0"
  },
  "packageManager": "pnpm@9.15.0",
  "engines": {
    "node": ">=20"
  }
}
```

### Install Turborepo

```bash
pnpm add -D turbo typescript
```

---

## 3. Turborepo Configuration

### turbo.json

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".next/**", "!.next/cache/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "lint": {
      "dependsOn": ["^build"]
    },
    "typecheck": {
      "dependsOn": ["^build"]
    },
    "test": {
      "dependsOn": ["^build"]
    },
    "clean": {
      "cache": false
    }
  }
}
```

---

## 4. Shared Package

### packages/shared/package.json

```json
{
  "name": "@my-app/shared",
  "version": "0.0.1",
  "private": true,
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "require": "./dist/index.cjs"
    }
  },
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "tsup": "^8.0.0",
    "typescript": "^5.7.0"
  }
}
```

### packages/shared/tsup.config.ts

```ts
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
});
```

### packages/shared/src/types/enums.ts

```ts
export enum UserRole {
  ADMIN = 'admin',
  USER = 'user',
}

export enum UserStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  PENDING = 'pending',
}
```

### packages/shared/src/index.ts

```ts
export * from './types/enums';
export * from './constants';
```

---

## 5. UI Package (shadcn + Tailwind v4)

> **CRITICAL**: This section documents the correct Tailwind CSS v4 + shadcn/ui setup for monorepos.

### packages/ui/package.json

```json
{
  "name": "@my-app/ui",
  "version": "0.0.1",
  "private": true,
  "sideEffects": ["**/*.css"],
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    },
    "./styles.css": "./src/styles/globals.css"
  },
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch",
    "typecheck": "tsc --noEmit",
    "ui:add": "pnpm dlx shadcn@latest add"
  },
  "dependencies": {
    "@radix-ui/react-dialog": "^1.1.0",
    "@radix-ui/react-dropdown-menu": "^2.1.0",
    "@radix-ui/react-slot": "^1.1.0",
    "class-variance-authority": "^0.7.0",
    "clsx": "^2.1.0",
    "lucide-react": "^0.469.0",
    "tailwind-merge": "^2.6.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "tailwindcss": "^4.0.0",
    "tsup": "^8.0.0",
    "tw-animate-css": "^1.2.0",
    "typescript": "^5.7.0"
  },
  "peerDependencies": {
    "react": "^18.0.0 || ^19.0.0",
    "react-dom": "^18.0.0 || ^19.0.0"
  }
}
```

### packages/ui/components.json

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "src/styles/globals.css",
    "baseColor": "neutral",
    "cssVariables": true,
    "prefix": ""
  },
  "aliases": {
    "components": "src/components",
    "utils": "src/lib/utils",
    "ui": "src/components",
    "lib": "src/lib",
    "hooks": "src/hooks"
  },
  "iconLibrary": "lucide"
}
```

### packages/ui/src/styles/globals.css (CRITICAL)

```css
@import 'tailwindcss';
@import 'tw-animate-css';

/* ============================================
   @source directives - Tell Tailwind v4 where to scan
   CRITICAL for monorepos - without this, classes won't generate!
   ============================================ */
@source "../components";
@source "../lib";
@source "../../../../apps/web/app";

/* Enable class-based dark mode for Tailwind v4 */
@custom-variant dark (&:where(.dark, .dark *));

/* ============================================
   CSS Variables - MUST BE OUTSIDE @layer base
   (Required for shadcn/ui + Tailwind v4)
   ============================================ */

:root {
  /* Light Mode */
  --background: hsl(0 0% 100%);
  --foreground: hsl(222 47% 11%);

  --card: hsl(0 0% 100%);
  --card-foreground: hsl(222 47% 11%);

  --popover: hsl(0 0% 100%);
  --popover-foreground: hsl(222 47% 11%);

  --primary: hsl(222 47% 11%);
  --primary-foreground: hsl(210 40% 98%);

  --secondary: hsl(210 40% 96%);
  --secondary-foreground: hsl(222 47% 11%);

  --muted: hsl(210 40% 96%);
  --muted-foreground: hsl(215 16% 47%);

  --accent: hsl(210 40% 96%);
  --accent-foreground: hsl(222 47% 11%);

  --destructive: hsl(0 84% 60%);
  --destructive-foreground: hsl(0 0% 100%);

  --border: hsl(214 32% 91%);
  --input: hsl(214 32% 91%);
  --ring: hsl(222 47% 11%);

  --radius: 0.5rem;

  /* Chart colors */
  --chart-1: hsl(12 76% 61%);
  --chart-2: hsl(173 58% 39%);
  --chart-3: hsl(197 37% 24%);
  --chart-4: hsl(43 74% 66%);
  --chart-5: hsl(27 87% 67%);
}

.dark {
  /* Dark Mode */
  --background: hsl(222 47% 11%);
  --foreground: hsl(210 40% 98%);

  --card: hsl(222 47% 11%);
  --card-foreground: hsl(210 40% 98%);

  --popover: hsl(222 47% 11%);
  --popover-foreground: hsl(210 40% 98%);

  --primary: hsl(210 40% 98%);
  --primary-foreground: hsl(222 47% 11%);

  --secondary: hsl(217 33% 17%);
  --secondary-foreground: hsl(210 40% 98%);

  --muted: hsl(217 33% 17%);
  --muted-foreground: hsl(215 20% 65%);

  --accent: hsl(217 33% 17%);
  --accent-foreground: hsl(210 40% 98%);

  --destructive: hsl(0 72% 51%);
  --destructive-foreground: hsl(0 0% 100%);

  --border: hsl(217 33% 17%);
  --input: hsl(217 33% 17%);
  --ring: hsl(224 76% 48%);

  /* Chart colors (dark) */
  --chart-1: hsl(220 70% 50%);
  --chart-2: hsl(160 60% 45%);
  --chart-3: hsl(30 80% 55%);
  --chart-4: hsl(280 65% 60%);
  --chart-5: hsl(340 75% 55%);
}

/* ============================================
   Theme Integration with Tailwind v4
   Maps CSS variables to Tailwind color classes
   ============================================ */

@theme inline {
  /* Colors */
  --color-background: var(--background);
  --color-foreground: var(--foreground);

  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);

  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);

  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);

  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);

  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);

  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);

  --color-destructive: var(--destructive);
  --color-destructive-foreground: var(--destructive-foreground);

  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);

  /* Chart colors */
  --color-chart-1: var(--chart-1);
  --color-chart-2: var(--chart-2);
  --color-chart-3: var(--chart-3);
  --color-chart-4: var(--chart-4);
  --color-chart-5: var(--chart-5);

  /* Border radius */
  --radius-lg: var(--radius);
  --radius-md: calc(var(--radius) - 2px);
  --radius-sm: calc(var(--radius) - 4px);

  /* Font family */
  --font-sans: 'Inter', system-ui, sans-serif;
}

/* ============================================
   Base Layer - Apply defaults
   ============================================ */

@layer base {
  * {
    @apply border-border;
  }

  body {
    @apply bg-background text-foreground;
    font-feature-settings: 'rlig' 1, 'calt' 1;
  }

  html {
    scroll-behavior: smooth;
  }

  :focus-visible {
    @apply outline-none ring-2 ring-ring ring-offset-2 ring-offset-background;
  }
}
```

### packages/ui/src/lib/utils.ts

```ts
import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

### packages/ui/src/index.ts

```ts
// Re-export components
export * from './components/button';
export * from './components/card';
export * from './components/dialog';
export * from './components/dropdown-menu';
export * from './components/input';
export * from './components/label';
// ... add more as you add components

// Re-export utils
export { cn } from './lib/utils';
```

### Install shadcn components

```bash
cd packages/ui
pnpm dlx shadcn@latest add button card dialog dropdown-menu input label
```

---

## 6. Backend (NestJS)

### apps/api/package.json

```json
{
  "name": "@my-app/api",
  "version": "0.0.1",
  "private": true,
  "scripts": {
    "build": "nest build",
    "dev": "nest start --watch",
    "start": "nest start",
    "start:prod": "node dist/main",
    "lint": "eslint \"{src,apps,libs,test}/**/*.ts\"",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "db:migrate": "typeorm migration:run -d dist/data-source.js",
    "db:seed": "ts-node src/database/seeds/run-seed.ts",
    "db:generate": "typeorm migration:generate -d dist/data-source.js"
  },
  "dependencies": {
    "@my-app/shared": "workspace:*",
    "@nestjs/common": "^10.4.0",
    "@nestjs/config": "^3.3.0",
    "@nestjs/core": "^10.4.0",
    "@nestjs/jwt": "^10.2.0",
    "@nestjs/passport": "^10.0.0",
    "@nestjs/platform-express": "^10.4.0",
    "@nestjs/swagger": "^8.1.0",
    "@nestjs/typeorm": "^10.0.0",
    "bcrypt": "^5.1.0",
    "class-transformer": "^0.5.0",
    "class-validator": "^0.14.0",
    "passport": "^0.7.0",
    "passport-jwt": "^4.0.0",
    "pg": "^8.13.0",
    "reflect-metadata": "^0.2.0",
    "rxjs": "^7.8.0",
    "typeorm": "^0.3.20"
  },
  "devDependencies": {
    "@nestjs/cli": "^10.4.0",
    "@nestjs/schematics": "^10.2.0",
    "@types/bcrypt": "^5.0.0",
    "@types/express": "^5.0.0",
    "@types/node": "^22.0.0",
    "@types/passport-jwt": "^4.0.0",
    "ts-node": "^10.9.0",
    "typescript": "^5.7.0",
    "vitest": "^2.1.0"
  }
}
```

### apps/api/src/main.ts

```ts
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // CORS
  app.enableCors({
    origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000'],
    credentials: true,
  });

  // Swagger/OpenAPI setup (CRITICAL for Orval)
  const config = new DocumentBuilder()
    .setTitle('My App API')
    .setDescription('API documentation')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  // Save OpenAPI spec to file for Orval
  const fs = await import('fs');
  fs.writeFileSync('./openapi.json', JSON.stringify(document, null, 2));

  await app.listen(process.env.PORT || 3001);
  console.log(`API running on http://localhost:${process.env.PORT || 3001}`);
  console.log(`Swagger docs at http://localhost:${process.env.PORT || 3001}/docs`);
}
bootstrap();
```

### apps/api/src/app.module.ts

```ts
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get('DATABASE_HOST', 'localhost'),
        port: config.get('DATABASE_PORT', 5432),
        username: config.get('DATABASE_USER', 'postgres'),
        password: config.get('DATABASE_PASSWORD', 'postgres'),
        database: config.get('DATABASE_NAME', 'myapp'),
        entities: [__dirname + '/**/*.entity{.ts,.js}'],
        synchronize: false, // Use migrations in production!
        logging: config.get('NODE_ENV') === 'development',
      }),
    }),
    AuthModule,
    UsersModule,
  ],
})
export class AppModule {}
```

### apps/api/src/data-source.ts

```ts
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';

dotenv.config();

export default new DataSource({
  type: 'postgres',
  host: process.env.DATABASE_HOST || 'localhost',
  port: parseInt(process.env.DATABASE_PORT || '5432'),
  username: process.env.DATABASE_USER || 'postgres',
  password: process.env.DATABASE_PASSWORD || 'postgres',
  database: process.env.DATABASE_NAME || 'myapp',
  entities: ['src/**/*.entity.ts'],
  migrations: ['src/database/migrations/*.ts'],
});
```

### Example Entity: apps/api/src/modules/users/entities/user.entity.ts

```ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { UserRole, UserStatus } from '@my-app/shared';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column({ select: false })
  passwordHash: string;

  @Column()
  firstName: string;

  @Column()
  lastName: string;

  @Column({ type: 'enum', enum: UserRole, default: UserRole.USER })
  role: UserRole;

  @Column({ type: 'enum', enum: UserStatus, default: UserStatus.PENDING })
  status: UserStatus;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
```

### Example Controller with Swagger decorators

```ts
import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UserResponseDto } from './dto/user-response.dto';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new user' })
  @ApiResponse({ status: 201, type: UserResponseDto })
  async create(@Body() dto: CreateUserDto): Promise<UserResponseDto> {
    return this.usersService.create(dto);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiResponse({ status: 200, type: UserResponseDto })
  async getMe(@CurrentUser() user: User): Promise<UserResponseDto> {
    return user;
  }
}
```

---

## 7. Frontend (React + Vite)

### apps/web/package.json

```json
{
  "name": "@my-app/web",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "lint": "eslint . --ext ts,tsx",
    "typecheck": "tsc --noEmit",
    "generate:api": "orval"
  },
  "dependencies": {
    "@my-app/shared": "workspace:*",
    "@my-app/ui": "workspace:*",
    "@tanstack/react-form": "^0.40.0",
    "@tanstack/react-query": "^5.62.0",
    "@tanstack/react-router": "^1.93.0",
    "@tanstack/react-table": "^8.20.0",
    "axios": "^1.7.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "@tanstack/router-devtools": "^1.93.0",
    "@tanstack/router-plugin": "^1.93.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.0",
    "orval": "^7.3.0",
    "tailwindcss": "^4.0.0",
    "typescript": "^5.7.0",
    "vite": "^6.0.0"
  }
}
```

### apps/web/vite.config.ts

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { TanStackRouterVite } from '@tanstack/router-plugin/vite';
import path from 'path';

export default defineConfig({
  plugins: [
    TanStackRouterVite({
      routesDirectory: './app/routes',
      generatedRouteTree: './app/routeTree.gen.ts',
    }),
    react(),
  ],
  resolve: {
    alias: {
      '~': path.resolve(__dirname, './app'),
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
});
```

### apps/web/app/styles/globals.css

```css
/* Import UI package styles (includes Tailwind v4 + all theme config) */
@import '@my-app/ui/styles.css';

/* App-specific styles only - DO NOT add another @import 'tailwindcss' */
```

### apps/web/app/main.tsx

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider, createRouter } from '@tanstack/react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { routeTree } from './routeTree.gen';
import './styles/globals.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60, // 1 minute
      retry: 1,
    },
  },
});

const router = createRouter({
  routeTree,
  context: { queryClient },
  defaultPreload: 'intent',
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </React.StrictMode>,
);
```

### apps/web/app/routes/__root.tsx

```tsx
import { createRootRouteWithContext, Outlet } from '@tanstack/react-router';
import { TanStackRouterDevtools } from '@tanstack/router-devtools';
import type { QueryClient } from '@tanstack/react-query';

interface RouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
});

function RootLayout() {
  return (
    <>
      <Outlet />
      {import.meta.env.DEV && <TanStackRouterDevtools position="bottom-right" />}
    </>
  );
}
```

### apps/web/app/routes/index.tsx

```tsx
import { createFileRoute } from '@tanstack/react-router';
import { Button } from '@my-app/ui';

export const Route = createFileRoute('/')({
  component: HomePage,
});

function HomePage() {
  return (
    <div className="container mx-auto p-8">
      <h1 className="text-4xl font-bold mb-4">Welcome</h1>
      <Button>Get Started</Button>
    </div>
  );
}
```

---

## 8. Orval API Client Generation

### apps/web/orval.config.ts

```ts
import { defineConfig } from 'orval';

export default defineConfig({
  api: {
    input: {
      target: '../api/openapi.json',
    },
    output: {
      mode: 'tags-split',
      target: './app/lib/api/generated',
      schemas: './app/lib/api/model',
      client: 'react-query',
      httpClient: 'axios',
      mock: false,
      override: {
        mutator: {
          path: './app/lib/api/axios-instance.ts',
          name: 'customInstance',
        },
        query: {
          useQuery: true,
          useMutation: true,
          useInfinite: true,
          useInfiniteQueryParam: 'cursor',
          options: {
            staleTime: 1000 * 60, // 1 minute
          },
        },
      },
    },
  },
});
```

### apps/web/app/lib/api/axios-instance.ts

```ts
import axios, { AxiosRequestConfig, AxiosError } from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const axiosInstance = axios.create({
  baseURL: API_URL,
  withCredentials: true,
});

// Request interceptor - add auth token
axiosInstance.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor - handle errors
axiosInstance.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('accessToken');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  },
);

// Custom instance for Orval
export const customInstance = <T>(config: AxiosRequestConfig): Promise<T> => {
  return axiosInstance(config).then((response) => response.data);
};

export default axiosInstance;
```

### Generate API client

```bash
# First, build and run the API to generate openapi.json
cd apps/api && pnpm build && pnpm start

# Then generate the client
cd apps/web && pnpm generate:api
```

### Using generated hooks

```tsx
import { useGetUsers, useCreateUser } from '~/lib/api/generated/users';

function UsersPage() {
  const { data: users, isLoading } = useGetUsers();
  const createUser = useCreateUser();

  const handleCreate = () => {
    createUser.mutate({
      data: { email: 'new@example.com', firstName: 'New', lastName: 'User' },
    });
  };

  if (isLoading) return <div>Loading...</div>;

  return (
    <ul>
      {users?.map((user) => (
        <li key={user.id}>{user.email}</li>
      ))}
    </ul>
  );
}
```

---

## 9. TanStack Integration

### TanStack Form Example

```tsx
import { useForm } from '@tanstack/react-form';
import { zodValidator } from '@tanstack/zod-form-adapter';
import { z } from 'zod';
import { Button, Input, Label } from '@my-app/ui';

const userSchema = z.object({
  email: z.string().email('Invalid email'),
  firstName: z.string().min(1, 'Required'),
  lastName: z.string().min(1, 'Required'),
});

type UserFormData = z.infer<typeof userSchema>;

export function UserForm({ onSubmit }: { onSubmit: (data: UserFormData) => void }) {
  const form = useForm({
    defaultValues: {
      email: '',
      firstName: '',
      lastName: '',
    },
    onSubmit: async ({ value }) => {
      onSubmit(value);
    },
    validatorAdapter: zodValidator(),
    validators: {
      onChange: userSchema,
    },
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        e.stopPropagation();
        form.handleSubmit();
      }}
      className="space-y-4"
    >
      <form.Field name="email">
        {(field) => (
          <div>
            <Label htmlFor={field.name}>Email</Label>
            <Input
              id={field.name}
              value={field.state.value}
              onChange={(e) => field.handleChange(e.target.value)}
              onBlur={field.handleBlur}
            />
            {field.state.meta.errors.length > 0 && (
              <p className="text-sm text-destructive mt-1">
                {field.state.meta.errors.join(', ')}
              </p>
            )}
          </div>
        )}
      </form.Field>

      <form.Field name="firstName">
        {(field) => (
          <div>
            <Label htmlFor={field.name}>First Name</Label>
            <Input
              id={field.name}
              value={field.state.value}
              onChange={(e) => field.handleChange(e.target.value)}
            />
          </div>
        )}
      </form.Field>

      <form.Field name="lastName">
        {(field) => (
          <div>
            <Label htmlFor={field.name}>Last Name</Label>
            <Input
              id={field.name}
              value={field.state.value}
              onChange={(e) => field.handleChange(e.target.value)}
            />
          </div>
        )}
      </form.Field>

      <Button type="submit" disabled={form.state.isSubmitting}>
        {form.state.isSubmitting ? 'Submitting...' : 'Submit'}
      </Button>
    </form>
  );
}
```

### TanStack Table Example

```tsx
import {
  useReactTable,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import { useState } from 'react';
import { Button, Input } from '@my-app/ui';

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
}

const columns: ColumnDef<User>[] = [
  {
    accessorKey: 'email',
    header: 'Email',
  },
  {
    accessorKey: 'firstName',
    header: 'First Name',
  },
  {
    accessorKey: 'lastName',
    header: 'Last Name',
  },
];

export function UsersTable({ data }: { data: User[] }) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState('');

  const table = useReactTable({
    data,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  return (
    <div className="space-y-4">
      <Input
        placeholder="Search..."
        value={globalFilter}
        onChange={(e) => setGlobalFilter(e.target.value)}
        className="max-w-sm"
      />

      <div className="border rounded-md">
        <table className="w-full">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className="border-b bg-muted/50">
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className="px-4 py-3 text-left font-medium cursor-pointer hover:bg-muted"
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
                    {{ asc: ' ↑', desc: ' ↓' }[header.column.getIsSorted() as string] ?? null}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} className="border-b hover:bg-muted/50">
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-4 py-3">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
        </div>
        <div className="space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
```

---

## 10. Docker Development

### docker/docker-compose.yml

```yaml
services:
  postgres:
    image: postgres:16-alpine
    container_name: myapp-postgres
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: myapp
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    container_name: myapp-redis
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

  minio:
    image: minio/minio
    container_name: myapp-minio
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    ports:
      - "9000:9000"
      - "9001:9001"
    volumes:
      - minio_data:/data

  mailhog:
    image: mailhog/mailhog
    container_name: myapp-mailhog
    ports:
      - "1025:1025"
      - "8025:8025"

volumes:
  postgres_data:
  redis_data:
  minio_data:
```

### apps/api/.env.example

```env
# Server
PORT=3001
NODE_ENV=development

# Database
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_USER=postgres
DATABASE_PASSWORD=postgres
DATABASE_NAME=myapp

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# JWT
JWT_SECRET=your-super-secret-jwt-key-change-in-production
JWT_EXPIRATION=7d

# CORS
CORS_ORIGIN=http://localhost:3000

# Storage (MinIO/S3)
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
S3_BUCKET=myapp
```

### apps/web/.env.example

```env
VITE_API_URL=http://localhost:3001
VITE_APP_NAME=My App
```

---

## 11. Authentication

### JWT Auth Guard

```ts
// apps/api/src/common/guards/jwt-auth.guard.ts
import { Injectable, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext) {
    return super.canActivate(context);
  }

  handleRequest(err: any, user: any) {
    if (err || !user) {
      throw err || new UnauthorizedException('Invalid token');
    }
    return user;
  }
}
```

### Current User Decorator

```ts
// apps/api/src/common/decorators/current-user.decorator.ts
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
```

### Frontend Auth Context

```tsx
// apps/web/app/components/auth/AuthProvider.tsx
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useGetMe, useLogin, useLogout } from '~/lib/api/generated/auth';

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
}

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const { data: user, isLoading, refetch } = useGetMe({
    query: {
      retry: false,
      enabled: !!localStorage.getItem('accessToken'),
    },
  });

  const loginMutation = useLogin();
  const logoutMutation = useLogout();

  const login = async (email: string, password: string) => {
    const result = await loginMutation.mutateAsync({ data: { email, password } });
    localStorage.setItem('accessToken', result.accessToken);
    await refetch();
    navigate({ to: '/' });
  };

  const logout = () => {
    logoutMutation.mutate(undefined, {
      onSuccess: () => {
        localStorage.removeItem('accessToken');
        navigate({ to: '/login' });
      },
    });
  };

  return (
    <AuthContext.Provider value={{ user: user ?? null, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
```

---

## 12. Troubleshooting

### Tailwind v4 Classes Not Generating (Monorepo)

**Problem**: Classes like `bg-popover`, `text-muted-foreground` don't exist in built CSS.

**Solution**: Add `@source` directives in your globals.css:

```css
@import 'tailwindcss';

/* CRITICAL: Tell Tailwind where to scan */
@source "../components";
@source "../lib";
@source "../../../../apps/web/app";  /* Adjust path for your structure */
```

### CSS Variables Not Working

**Problem**: Theme colors don't apply, everything looks wrong.

**Solution**: Ensure CSS variables are OUTSIDE `@layer base`:

```css
/* WRONG - inside @layer */
@layer base {
  :root { --background: hsl(0 0% 100%); }
}

/* CORRECT - outside @layer */
:root { --background: hsl(0 0% 100%); }

@layer base {
  body { @apply bg-background; }
}
```

### Double Tailwind Import

**Problem**: Styles conflict or don't apply correctly.

**Solution**: Only import Tailwind ONCE in the UI package. Web app imports UI styles:

```css
/* packages/ui/src/styles/globals.css */
@import 'tailwindcss';

/* apps/web/app/styles/globals.css */
@import '@my-app/ui/styles.css';
/* DO NOT add another @import 'tailwindcss' here */
```

### Orval Not Finding OpenAPI Spec

**Problem**: `orval` command fails with "file not found".

**Solution**:
1. Build and run the API first: `cd apps/api && pnpm build && pnpm start`
2. Verify `openapi.json` is generated in `apps/api/`
3. Check path in `orval.config.ts` matches

### TypeORM Migration Issues

**Problem**: Migrations fail or generate empty files.

**Solution**:
1. Build API first: `pnpm --filter api build`
2. Ensure `data-source.ts` uses correct entity paths
3. Run from API directory: `cd apps/api && pnpm db:generate src/database/migrations/MigrationName`

### TanStack Router Type Errors

**Problem**: Route types not recognized.

**Solution**:
1. Ensure `routeTree.gen.ts` is generated: `pnpm dev` auto-generates it
2. Add to tsconfig: `"include": ["app/**/*", "app/routeTree.gen.ts"]`
3. Restart TypeScript server in IDE

---

## Quick Start Checklist

```bash
# 1. Clone and install
git clone <repo> && cd <repo>
pnpm install

# 2. Start Docker services
pnpm docker:up

# 3. Copy env files
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env

# 4. Run migrations
pnpm db:migrate

# 5. Seed database (optional)
pnpm db:seed

# 6. Start development
pnpm dev

# API: http://localhost:3001
# Web: http://localhost:3000
# Swagger: http://localhost:3001/docs
# MailHog: http://localhost:8025
```

---

## References

- [Turborepo Docs](https://turbo.build/repo/docs)
- [NestJS Docs](https://docs.nestjs.com)
- [Tailwind CSS v4](https://tailwindcss.com/docs)
- [shadcn/ui Tailwind v4](https://ui.shadcn.com/docs/tailwind-v4)
- [TanStack Query](https://tanstack.com/query)
- [TanStack Router](https://tanstack.com/router)
- [TanStack Form](https://tanstack.com/form)
- [TanStack Table](https://tanstack.com/table)
- [Orval](https://orval.dev)
- [TypeORM](https://typeorm.io)
