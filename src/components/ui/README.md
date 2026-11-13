# Controles comunes (`src/components/ui`)

Importa desde `../components/ui`. Los `<select>`, `<input>` de texto/número/rango/color/casilla/radio/archivo y `<textarea>` ya se ven con la marca por estilos globales (`src/index.css`), así que un control suelto nunca sale con el aspecto del navegador. Estos componentes añaden etiqueta, accesibilidad y comportamiento.

- **Button**: `<Button variant="primary|secondary|ghost|danger" size="sm|md" icon={Download} loading={busy} onClick={...}>Texto</Button>`. Acepta todos los atributos de `<button>`; `loading` lo bloquea y muestra un spinner.
- **Select**: `<Select label="Idioma" value={v} onChange={(e) => setV(e.target.value)}><option …/></Select>`. Es el `<select>` nativo (misma API) con label asociado y `hint` opcional.
- **NumberField**: `<NumberField label="Tamaño" value={n} onChange={setN} min={8} max={72} step={1} unit="pt" />`. Botones −/+, unidad dentro del campo; siempre entrega un número dentro de min–max. Sin label visible, pasa `ariaLabel`.
- **Slider**: `<Slider label="Opacidad" value={o} onChange={setO} min={0.1} max={1} step={0.05} format={(v) => `${Math.round(v * 100)}`} unit="%" />`. Muestra el valor a la derecha de la etiqueta; el relleno en color de marca es automático.
- **ColorField**: `<ColorField label="Color" value={hex} onChange={setHex} />`. Fila de muestras (`COMMON_COLORS` por defecto, o `palette`) + botón «Otro» que abre el selector del sistema oculto. Siempre entrega `#rrggbb`.
- **Checkbox / Switch**: `<Checkbox checked={x} onChange={setX} label="Texto" description="Ayuda opcional" />`; `Switch` tiene la misma API pero es un interruptor (`role="switch"`). La etiqueta es clicable.
- **FileButton**: `<FileButton accept="image/*" multiple onFiles={(files) => …}>Añadir imagen</FileButton>`. Abre el selector del sistema; `onFiles` recibe un `File[]` (un solo elemento si no es `multiple`). Admite `variant`, `size` e `icon`.
- **useRangeFill(ref)**: ya lo usa `ToolFrame` para pintar el relleno de los `<input type="range">` sueltos de cada herramienta; no hace falta llamarlo a mano.

Notas: `inputCls` y `Field` (de `ToolFrame`) siguen valiendo para campos de texto sueltos. Los controles de 40 px mínimo en pantallas táctiles ya van incluidos. Para ocultar un input de color (selector del Taller), `sr-only` sigue funcionando.
- **Notice**: `<Notice kind="info|warn|error|success" action={{ label: 'Reintentar', onClick }} onClose={() => …}>Texto corto</Notice>`. `error` usa `role="alert"`; `action` y `onClose` son opcionales.
- **PagePager**: `<PagePager page={p} total={n} onChange={setP} />` → «‹ Página 2 de 5 ›», botones de 40 px, desactivados en los extremos.
