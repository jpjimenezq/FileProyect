# FileProyect — Clon de iLovePDF (ES)

Aplicación web de herramientas PDF inspirada en https://www.ilovepdf.com/es.
Objetivo: replicar la navegación, el flujo de uso y las herramientas principales, priorizando velocidad de entrega.

## 1. Stack propuesto

| Capa | Elección | Motivo |
|---|---|---|
| Frontend | Vite + React + TypeScript | Arranque rápido, sin SSR innecesario |
| Estilos | Tailwind CSS | Replicar el diseño sin escribir CSS a mano |
| Router | React Router | Una ruta por herramienta (`/unir-pdf`, `/dividir-pdf`…) |
| PDF en navegador | `pdf-lib` (editar), `pdfjs-dist` (render/miniaturas) | Procesa en el cliente: sin servidor, privado, gratis |
| ZIP / descargas | `jszip`, `file-saver` | Salidas con varios archivos |
| OCR | `tesseract.js` | OCR en cliente |
| Backend (Fase 3) | Node + Fastify + LibreOffice headless / Ghostscript / qpdf | Conversiones Office, PDF/A, compresión real, reparación |
| IA (Fase 4) | API de DeepSeek (compatible con el formato OpenAI, `https://api.deepseek.com`) | Resumir, traducir y PDF a Markdown |

Principio: **todo lo que se pueda hacer en el navegador se hace en el navegador**; el backend solo para lo que no se puede.

## 2. Estructura de la interfaz (según captura)

**Header fijo:** logo · Unir PDF · Dividir PDF · Comprimir PDF · Convertir PDF (desplegable) · Todas las herramientas PDF (mega-menú) · Acceder · Registro · icono de apps.

**Mega-menú "Todas las herramientas"** (7 columnas):

1. **Ordenar PDF:** Unir, Dividir, Eliminar páginas, Extraer páginas, Ordenar PDF, Escanea a PDF
2. **Optimizar PDF:** Comprimir, Reparar, OCR
3. **Convertir a PDF:** JPG, Word, PowerPoint, Excel, HTML
4. **Convertir desde PDF:** JPG, Word, PowerPoint, Excel, PDF/A
5. **Editar PDF:** Rotar, Insertar números de página, Marca de agua, Recortar, Editar, Formularios
6. **Seguridad:** Desbloquear, Proteger, Firmar, Censurar, Comparar
7. **PDF Intelligence:** Resumir con IA, Traducir, PDF a Markdown

**Home:** hero con título + rejilla de tarjetas de herramientas (icono de color por categoría, nombre, descripción corta).

**Página de herramienta (flujo común):**
1. Zona de arrastrar/soltar + botón "Seleccionar archivos PDF"
2. Lista/miniaturas de archivos cargados (reordenar, quitar, rotar)
3. Panel lateral de opciones de la herramienta + botón de acción grande
4. Pantalla de progreso
5. Pantalla de descarga (descargar, volver a empezar, ver resultado)

## 3. Alcance por herramienta y fase

Leyenda: 🟢 cliente · 🟠 requiere backend · 🔵 requiere IA

### Fase 1 — MVP (núcleo + 10 herramientas)
Shell de la app, header, mega-menú, home, componente genérico de herramienta (subida → opciones → proceso → descarga), i18n ES.

| Herramienta | Tipo | Notas |
|---|---|---|
| Unir PDF | 🟢 | Reordenar por arrastre |
| Dividir PDF | 🟢 | Por rangos / cada N páginas / todas |
| Eliminar páginas | 🟢 | Selección sobre miniaturas |
| Extraer páginas | 🟢 | Selección sobre miniaturas |
| Ordenar PDF | 🟢 | Drag & drop de páginas |
| Rotar PDF | 🟢 | Por página o global |
| JPG a PDF | 🟢 | Orientación, tamaño, margen |
| PDF a JPG | 🟢 | pdf.js → canvas → ZIP |
| Insertar números de página | 🟢 | Posición, formato, inicio |
| Marca de agua | 🟢 | Texto o imagen, opacidad, posición |

### Fase 2 — Cliente avanzado ✅
Recortar · Editar (texto, formas, resaltado, dibujo, imágenes) · Firmar (dibujada, escrita o imagen) · Censurar (rasteriza las páginas afectadas para borrar el texto de verdad) · Comparar (diferencia visual por página) · Formularios (rellenar campos AcroForm; crear formularios queda fuera) · Escanea a PDF (cámara o imágenes) · OCR (tesseract.js, PDF con texto o .txt) · PDF a Markdown (heurístico por tamaño de letra; la versión con IA llega en la Fase 4).

Desbloquear y Proteger pasan a la Fase 3: pdf-lib no cifra ni descifra, hace falta qpdf en el backend.

### Fase 3 — Backend 🟠 ✅
Servidor Fastify (`server/`) que ejecuta binarios sin shell, con archivos temporales que se borran al terminar, límite de 100 MB, validación de la cabecera del archivo, cola de trabajos (`JOBS`, 3 por defecto) y límite de 60 peticiones por minuto.

| Herramienta | Motor |
|---|---|
| Comprimir (3 niveles) | Ghostscript |
| Reparar | qpdf (con Ghostscript como segundo intento) |
| Proteger / Desbloquear | qpdf, AES-256; las contraseñas viajan en un fichero de argumentos, no en la línea de comandos |
| PDF a PDF/A | Ghostscript (PDF/A-2b compatible, no certificado) |
| Word, Excel, PowerPoint, HTML a PDF | LibreOffice |
| PDF a Word, PDF a PowerPoint | LibreOffice (conversión aproximada) |
| PDF a Excel | En el navegador: filas y columnas por posición del texto + exceljs |

Despliegue: `docker compose up --build` (imagen con qpdf, Ghostscript y LibreOffice; sirve también la web). HTML a PDF acepta archivos, no URLs, para evitar SSRF.

### Fase 4 — IA 🔵 (DeepSeek) ✅
Resumir con IA · Traducir PDF · PDF a Markdown con mejora por IA (opcional).
- El texto se extrae en el navegador con pdf.js y se envía por trozos (≈9.000 caracteres) a `/api/ai/:task`; el servidor llama a DeepSeek. Los prompts están en el servidor, el cliente solo elige tarea y opciones validadas.
- Resumen por etapas (map-reduce) para documentos largos; traducción página a página con 3 peticiones en paralelo; máximo 200.000 caracteres por documento.
- La clave `DEEPSEEK_API_KEY` solo vive en el servidor. Tope diario global (`AI_DAILY_CHARS`) y límite de 120 peticiones por minuto por IP.
- Traducir genera un PDF nuevo solo de texto (idiomas latinos); se pierde el diseño original. Los PDF escaneados necesitan OCR antes.
- La interfaz avisa de que el texto se envía a un servicio de terceros.
- Pendiente para la Fase 5: autenticación y cuotas por usuario; ahora el endpoint de IA es público y solo lo protege el tope global.

### Fase 5 — Cuentas, cuotas y cobros ✅
- **Cuentas:** correo y contraseña (scrypt), sesión en cookie firmada `HttpOnly` de 30 días, base de datos SQLite integrada (`node:sqlite`, sin dependencias) en `DATA_DIR`. Defensa CSRF por comprobación de `Origin`, 10 intentos por minuto en login y registro, borrado de cuenta.
- **Planes:** Invitado, Gratis y Pro (ver tabla). Las herramientas del navegador no tienen límite; solo se cuenta lo que cuesta dinero (servidor e IA).
- **Cobros:** Stripe Checkout para suscribirse, Stripe Customer Portal para cambiar tarjeta o cancelar, y webhook con firma verificada que activa y desactiva Pro. Dos días de gracia al vencer.
- **Recuperar contraseña:** enlace por correo (SMTP) de un solo uso que caduca en 1 hora; solo se guarda su hash; máximo 3 por hora y cuenta; la respuesta no revela si el correo existe; al cambiarla se cierran todas las sesiones abiertas.
- **Legal:** política de privacidad, términos de uso y aviso legal (`/privacidad`, `/terminos`, `/aviso-legal`), aceptación expresa al registrarse (se guarda la fecha) y consentimiento de inicio inmediato en la compra de Pro. Los textos son una base que **debe revisar un abogado**; los datos del titular se rellenan en `src/legal.config.ts`.

| | Invitado | Gratis | Pro |
|---|---|---|---|
| Herramientas en el navegador | ilimitadas | ilimitadas | ilimitadas |
| Conversiones de servidor al día | 3 | 10 | 300 |
| Tamaño máximo en servidor | 10 MB | 25 MB | 100 MB |
| IA al mes | — | 100.000 caracteres (~33 págs.) | 2.000.000 (~667 págs.) |
| Precio | 0 € | 0 € | 4,99 €/mes o 39,99 €/año |

## 3b. Modelo de negocio

Objetivo: que cada usuario de pago deje margen y que el uso gratuito tenga un coste acotado.

**Costes** (estimaciones; verifica las tarifas vigentes antes de lanzar):

| Concepto | Coste |
|---|---|
| Servidor (4 vCPU, 8 GB, para LibreOffice y Ghostscript) | 15–25 €/mes fijo |
| Dominio | ~1 €/mes |
| Stripe (tarjetas europeas) | ~1,5 % + 0,25 € por cobro |
| IVA (servicios digitales a particulares en la UE) | ~21 % incluido en el precio; usa Stripe Tax |
| DeepSeek (IA) | del orden de 0,3–0,5 USD por millón de tokens |

**Coste máximo por usuario** (cuota agotada cada mes):
- Gratis: 100.000 caracteres ≈ 25.000 tokens ≈ **menos de 0,02 €** de IA, más algo de CPU.
- Pro: 2.000.000 caracteres ≈ 500.000 tokens de entrada y unos 100.000 de salida ≈ **0,2–0,3 €**.

**Ingreso neto por Pro** a 4,99 €/mes: 4,99 / 1,21 (IVA) ≈ 4,12 € − Stripe 0,33 € ≈ 3,79 €; menos 0,3 € de IA ≈ **3,5 € de contribución por usuario y mes**. Plan anual: 39,99 € / 12 ≈ 3,33 €/mes con IVA, ≈ 2,6 € de contribución.

**Punto de equilibrio:** con 25 € de costes fijos, **unos 8 usuarios Pro** (mensuales). Con 100 usuarios Pro ≈ 325 €/mes de beneficio antes de impuestos sobre la renta; con 500 ≈ 1.700 €/mes (el servidor tendría que crecer).

**Palancas:** el tope diario global (`AI_DAILY_CHARS`) protege de picos de gasto; los límites por plan acotan el peor caso; las herramientas del navegador no cuestan nada por usuario, así que el plan gratuito atrae tráfico sin riesgo.

**Ventajas frente a otros servicios online** (sin nombrar competidores en la interfaz): procesado en el navegador (privacidad), sin anuncios ni marcas de agua incluso en gratis, IA incluida con cuota gratuita, y herramientas básicas sin límite artificial.

## 4. Requisitos funcionales transversales

- RF1: Arrastrar y soltar, selector de archivos, múltiples archivos donde aplique.
- RF2: Validar tipo y tamaño (límite por defecto 100 MB) con mensajes claros.
- RF3: Miniaturas de páginas con pdf.js (carga diferida).
- RF4: Barra de progreso durante el procesado; no bloquear la UI (Web Workers).
- RF5: Descarga directa del resultado (PDF o ZIP).
- RF6: Cada herramienta tiene URL propia y título/meta SEO en español.
- RF7: Navegación por teclado y etiquetas accesibles en el mega-menú.

## 5. Requisitos no funcionales

- **Privacidad:** archivos de Fase 1–2 nunca salen del navegador; mostrarlo en la UI.
- **Rendimiento:** archivos de hasta 50 MB sin congelar la interfaz.
- **Responsive:** móvil, tablet y escritorio; el mega-menú pasa a menú lateral en móvil.
- **Navegadores:** últimas 2 versiones de Chrome, Edge, Firefox y Safari.
- **Calidad:** TypeScript estricto, ESLint, pruebas con Vitest sobre las funciones de procesado de PDF.

## 6. Arquitectura de código

```
src/
  app/            router, layout, header, mega-menú
  pages/          Home, ToolPage
  tools/          un módulo por herramienta
    registry.ts   lista central: id, ruta, nombre, categoría, icono, componente
    merge/ split/ rotate/ ...
  components/     Dropzone, FileList, PageThumbnails, ProgressBar, DownloadView
  lib/pdf/        wrappers de pdf-lib y pdfjs, workers
  i18n/es.ts
```

El **registro de herramientas** alimenta a la vez el mega-menú, la home y el router, así añadir una herramienta = un módulo + una línea en el registro.

## 7. Fuera de alcance

Copiar logotipo, marca o textos literales de iLovePDF (usaremos nombre y branding propios), integraciones Google Drive/Dropbox, apps móviles/escritorio, extensión de navegador.

## 8. Criterios de aceptación de Fase 1

- Las 10 herramientas funcionan de extremo a extremo con PDFs de prueba.
- El mega-menú y la home se generan desde el registro.
- Sin errores en consola; funciona en móvil.
- `npm run build` y `npm test` pasan.

## 9. Decisiones abiertas

1. ¿Nombre propio del proyecto/marca?
2. ¿Backend con Node, o prefieres Python (FastAPI)? Se necesita antes de la Fase 4 por la clave de DeepSeek.
3. ¿Hace falta autenticación (Fase 5) o solo herramientas?

## 10. Checklist: las 51 herramientas del menú

Ordenar: Unir ✔F1 · Dividir ✔F1 · Eliminar páginas ✔F1 · Extraer páginas ✔F1 · Ordenar ✔F1 · Escanea a PDF ✔F2
Optimizar: Comprimir ✔F3 · Reparar ✔F3 · OCR ✔F2
A PDF: JPG ✔F1 · Word ✔F3 · PowerPoint ✔F3 · Excel ✔F3 · HTML ✔F3
Desde PDF: JPG ✔F1 · Word ✔F3 · PowerPoint ✔F3 · Excel ✔F3 · PDF/A ✔F3
Editar: Rotar ✔F1 · Números de página ✔F1 · Marca de agua ✔F1 · Recortar ✔F2 · Editar ✔F2 · Formularios ✔F2
Seguridad: Desbloquear ✔F3 · Proteger ✔F3 · Firmar ✔F2 · Censurar ✔F2 · Comparar ✔F2
Intelligence: Resumir con IA ✔F4 · Traducir ✔F4 · PDF a Markdown ✔F2
Extras (tras la Fase 5, inspiradas en Stirling-PDF): PDF a texto · Extraer imágenes · Quitar páginas en blanco · Aplanar PDF · Metadatos · Quitar anotaciones · Varias páginas por hoja · Escalar páginas · Estampar PDF · Invertir colores · Efecto escáner · Texto a PDF · PDF a una sola página · Adjuntos del PDF · Marcadores del PDF · Ajustar contraste · modos de Dividir (por tamaño y por capítulos) · PDF a PNG · recorte automático
