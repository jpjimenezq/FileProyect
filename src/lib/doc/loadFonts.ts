// Registra (solo el CSS; el navegador descarga cada archivo de letra cuando se usa) los tipos de letra incluidos.
import.meta.glob(['/node_modules/@fontsource/*/latin-400.css', '/node_modules/@fontsource/*/latin-700.css'], { eager: true })

export {}
