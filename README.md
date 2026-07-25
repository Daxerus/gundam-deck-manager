# GCG // Deck Manager

Gestor de **colección y decks del Gundam Card Game** con estética de cabina/HUD.
Permite navegar el catálogo, marcar qué cartas tienes, construir decks validando las reglas
oficiales y — lo más importante — **gestionar swaps físicos entre decks activos**: como una
misma carta puede vivir en varios decks pero solo tienes copias limitadas, la app rastrea dónde
está físicamente cada copia y, al activar un deck, te dice de qué otro deck sacar cada carta.

Cada usuario tiene su propia colección y decks (aislados). El catálogo de cartas es compartido.
Todo el stack corre **gratis en Cloudflare** (Workers + D1 + assets), sin tarjeta.

## Funcionalidades

- **Cuentas**: login con username + contraseña; registro con código de invitación; primer acceso (bootstrap) para reclamar los datos existentes como admin.
- **Catálogo** filtrable por set, color, tipo, rareza, coste, nombre y texto de efecto (datos de [gcg-api](https://gcgapi.com)).
- **Colección**: marca copias que posees por impresión (`product_id`), con imágenes de carta.
- **Decks** con validación de reglas oficiales: 50 cartas, máx. 4 copias por `card_number`, máx. 2 colores, resource deck de 10.
- **Warnings** de cartas que no tienes y **lista de la compra** agregada.
- **Decks activos / SYSTEM SWAP**: varios decks activos simultáneos si no hay conflicto; al activar uno, plan de movimientos (de qué deck sale cada carta) y rastreo de ubicación física por impresión (`product_id`).

## Arquitectura

```
web/     SPA React + Vite + TypeScript + Tailwind (tema HUD)  →  build a worker/public
worker/  Cloudflare Worker (Hono) + Drizzle ORM + D1 (SQLite)
         · sirve la API en /api/* y el SPA (assets) en el mismo origen
```

Un único `wrangler deploy` publica API + frontend. Colección/decks/allocaciones viven en D1
**por usuario**. El catálogo se siembra desde el bulk NDJSON de gcg-api (`POST /api/admin/sync`, solo admin).

## Desarrollo local

Requisitos: Node ≥ 20.

```bash
npm install

# 1. Crea la base de datos D1 local + aplica migraciones
npm run db:migrate:local -w worker

# 2. Configura secretos locales (worker/.dev.vars)
#    APP_PASSWORD=<contraseña-legacy-solo-para-bootstrap>
#    JWT_SECRET=<cadena-larga-aleatoria>
#    REGISTRATION_CODE=<código-para-invitar-amigos>

# 3. Compila el frontend hacia worker/public
npm run build:web

# 4. Arranca el Worker (sirve API + SPA en http://127.0.0.1:8787)
npm run dev:worker
```

Para desarrollar el frontend con HMR, en otra terminal: `npm run dev:web` (Vite en :5173 con proxy `/api` → :8787).

### Primer acceso (bootstrap)

Tras aplicar la migración `0002_multi_user`, la app pide un **bootstrap único**:

1. Abre la app → pantalla *First Boot*.
2. Introduce el `APP_PASSWORD` actual, elige tu **username** y una **nueva contraseña** (≥ 8).
3. Tus decks/colección existentes quedan asignados a esa cuenta (admin).
4. Después puedes compartir `REGISTRATION_CODE` para que tus amigos se registren.

Los tokens JWT antiguos (login monousuario) dejan de valer; hay que iniciar sesión de nuevo.

### Registro de amigos

- `POST /api/auth/register` con `{ username, password, inviteCode }`.
- En la UI: login → “Registrarse con invitación”.
- Sin `REGISTRATION_CODE` configurado, el registro aparece cerrado.

### Sync del catálogo

Tras el bootstrap, con la cuenta admin llama a `POST /api/admin/sync` (Bearer JWT) para poblar
el catálogo (~1700 cartas). Solo administradores pueden sincronizar.

### Tests

```bash
npm test -w worker      # vitest: swaps, validación, passwords, aislamiento
```

## Despliegue gratuito en Cloudflare

Requisitos: cuenta de Cloudflare (gratis, sin tarjeta) y `npx wrangler login`.

```bash
# 1. Crea la base de datos D1 en tu cuenta
npx wrangler d1 create gundam-deck-manager -w worker
#   → copia el database_id que imprime y pégalo en worker/wrangler.toml
#     (reemplaza PLACEHOLDER_RUN_WRANGLER_D1_CREATE)

# 2. Aplica migraciones en remoto
npm run db:migrate:remote -w worker

# 3. Configura los secretos de producción
npx wrangler secret put APP_PASSWORD -w worker        # solo para el bootstrap inicial
npx wrangler secret put JWT_SECRET -w worker
npx wrangler secret put REGISTRATION_CODE -w worker   # código de invitación

# 4. Compila el frontend y despliega (API + SPA en un solo Worker)
npm run deploy
```

Tras el primer deploy:

1. Entra a la URL `*.workers.dev` y completa el **bootstrap** (APP_PASSWORD + username + nueva clave).
2. Ejecuta la sincronización del catálogo una vez (`POST /api/admin/sync` con el JWT admin).
3. (Opcional) Retira `APP_PASSWORD` del Worker cuando ya no lo necesites:
   `npx wrangler secret delete APP_PASSWORD -w worker`
4. Comparte la URL + `REGISTRATION_CODE` con tus amigos.

Repite el sync cuando salga un set nuevo (el dataset de gcg-api se refresca semanalmente;
`datasetVersion` se muestra en la cabecera).

### Notas

- **Migraciones**: se aplican con `wrangler d1 migrations apply` desde `worker/migrations/`.
  Para cambios de esquema, añade un nuevo `.sql` numerado (p. ej. `0002_*.sql`).
- **Capa gratuita**: Workers 100k req/día y D1 5 GB — de sobra para un grupo de amigos.
- **Postgres/otro host**: no necesario; todo encaja en el plan gratuito de Cloudflare.
- **Username**: 3–32 caracteres, `a-z`, `0-9` y `_` (se normaliza a minúsculas).
- **Contraseñas**: hash PBKDF2-SHA256 (Web Crypto); nunca se guardan en claro.

## Créditos y licencia

- Datos de cartas: **[gcg-api](https://gcgapi.com)**, bajo **Open Database License (ODbL) v1.0**.
- No afiliado a Bandai. *Gundam* y las imágenes de cartas son © Bandai. Las imágenes no se
  rehospedan; se sirven vía proxy de solo lectura para el navegador.
