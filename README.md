# FileProyect

Herramientas PDF online inspiradas en iLovePDF. Ver [REQUISITOS.md](REQUISITOS.md) para el alcance y las fases.

## Desarrollo

```bash
npm install
npm install --prefix server
npm run dev            # web en http://localhost:5173
```

Las herramientas de la Fase 1-2 funcionan solo con la web. Las de servidor (comprimir, reparar, proteger, desbloquear, PDF/A, conversiones Office) necesitan el backend con qpdf, Ghostscript y LibreOffice. Lo más sencillo es Docker:

```bash
docker compose up --build   # web + API en http://localhost:3001
```

Para desarrollar con recarga, deja Docker en el 3001 y arranca `npm run dev`: Vite reenvía `/api` al 3001.

## IA (DeepSeek)

Copia `.env.example` a `.env` y pon tu `DEEPSEEK_API_KEY`; reinicia el servidor. La clave solo vive en el servidor. El texto del PDF se extrae en el navegador y se envía por trozos a `/api/ai/:task`; los prompts están en `server/ai.js`. Sin clave, las herramientas de IA muestran un aviso y quedan desactivadas.

## Cuentas y cobros

El servidor guarda usuarios y consumo en SQLite dentro de `DATA_DIR` (en Docker, el volumen `fp-data`; haz copia de seguridad). Para cobrar necesitas una cuenta de Stripe: crea dos precios recurrentes (mensual y anual, impuestos incluidos), rellena las variables `STRIPE_*` del `.env` y apunta un webhook a `PUBLIC_URL/api/billing/webhook` con los eventos `checkout.session.completed` y `customer.subscription.*`. Para probar Pro en local sin Stripe, arranca con `BILLING_DEV=1` y llama a `POST /api/billing/dev-upgrade` con tu sesión (**nunca en producción**). Las cuentas de márgenes están en [REQUISITOS.md](REQUISITOS.md).

## Supabase y panel de administración

Con `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` en el entorno el servidor usa Supabase para identidad y datos de usuario (perfiles, uso, códigos de descuento, auditoría); sin ellas sigue con SQLite y cookies. En local: `npx supabase start` (la migración de `supabase/migrations/` se aplica sola; `npx supabase db reset` la reaplica), copia las claves de `npx supabase status -o env` a `.env.local` (ignorado por git; ver `.env.example`) y arranca el servidor. El acceso con Google queda declarado y desactivado en `supabase/config.toml`. El cliente envía `Authorization: Bearer <access_token>`; el inicio de sesión lo gestiona Supabase en el navegador (las rutas `/api/auth/*` responden 410). Para dar permisos de administrador: `ADMIN_EMAILS` o `npm run admin:grant -- correo@ejemplo.com` (el cambio tarda hasta 1 minuto por la caché de tokens). La API del panel vive bajo `/api/admin/*` (stats, users, discounts, audit); los códigos `percent`/`amount` se crean también en Stripe y los `grant` regalan Pro N días (`POST /api/billing/redeem`).

## Antes de publicar

1. Rellena los datos del titular en `src/legal.config.ts` (las páginas legales muestran un aviso mientras falten) y haz que los revise un abogado.
2. Configura `PUBLIC_URL` (con https), `SMTP_URL` y `MAIL_FROM` para el correo, y las variables `STRIPE_*` para cobrar.
3. Activa Stripe Tax y sirve la web detrás de HTTPS (con `TRUST_PROXY=1` si hay proxy inverso).
4. Haz copia de seguridad del volumen `fp-data`.

## Pruebas

```bash
npm test               # funciones PDF del navegador (Vitest)
npm run test:server    # lógica del servidor (node:test)
```

## Variables de entorno del servidor

| Variable | Por defecto | Uso |
|---|---|---|
| `PORT` | 3001 | Puerto |
| `JOBS` | 3 | Conversiones simultáneas |
| `DATA_DIR` | `server/data` | Base de datos y clave de sesión |
| `PUBLIC_URL` | — | URL pública (Stripe, cookies seguras) |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_MONTH`, `STRIPE_PRICE_YEAR` | — | Cobros |
| `QPDF_BIN`, `GS_BIN`, `SOFFICE_BIN` | `qpdf`, `gs`, `soffice` | Rutas a los binarios |
| `DEEPSEEK_API_KEY` | — | Activa Resumir, Traducir y la mejora de PDF a Markdown con IA |
| `DEEPSEEK_MODEL` | `deepseek-chat` | Modelo de DeepSeek |
| `AI_DAILY_CHARS` | 2000000 | Tope diario global de caracteres enviados a la IA |

## Taller

Espacio libre en `/taller`, todo en el navegador: editor de documentos (TipTap; abre y guarda `.docx`, exporta a PDF con el servidor o imprimiendo) y hoja de cálculo (motor de fórmulas con `fast-formula-parser`; abre y guarda `.xlsx`/`.csv`). Ambos guardan un borrador en el navegador. Código en `src/pages/taller` y `src/lib/{doc,sheet}`.
