/** Tipos de letra del Taller. Los del sistema se usan tal cual; los «incluidos» vienen con la aplicación (@fontsource). */
export const SYSTEM_FONTS = ['Arial', 'Verdana', 'Tahoma', 'Trebuchet MS', 'Calibri', 'Times New Roman', 'Georgia', 'Garamond', 'Cambria', 'Courier New', 'Consolas', 'Comic Sans MS', 'Impact']

export const BUNDLED_GROUPS: [string, string[]][] = [
  ['Sin serifa', [
    'Roboto', 'Open Sans', 'Lato', 'Montserrat', 'Poppins', 'Inter', 'Nunito', 'Nunito Sans', 'Raleway', 'Work Sans', 'Ubuntu', 'Noto Sans', 'Source Sans 3', 'PT Sans',
    'Fira Sans', 'Quicksand', 'Rubik', 'Karla', 'DM Sans', 'Manrope', 'Mulish', 'Barlow', 'Josefin Sans', 'Cabin', 'Oxygen', 'Archivo', 'Heebo', 'Hind', 'Titillium Web',
    'Exo 2', 'Asap', 'Catamaran', 'Overpass', 'Questrial', 'Varela Round', 'Comfortaa', 'Outfit', 'Space Grotesk', 'Plus Jakarta Sans', 'Lexend', 'Sora', 'Urbanist',
    'Red Hat Display', 'Public Sans', 'IBM Plex Sans', 'Abel', 'Signika', 'Prompt', 'Kanit', 'Maven Pro',
  ]],
  ['Con serifa', [
    'Merriweather', 'Playfair Display', 'Lora', 'PT Serif', 'Noto Serif', 'Libre Baskerville', 'Crimson Text', 'EB Garamond', 'Cormorant Garamond', 'Bitter', 'Arvo', 'Vollkorn',
    'Spectral', 'Cardo', 'Domine', 'Source Serif 4', 'IBM Plex Serif', 'Zilla Slab', 'Roboto Slab', 'Alegreya', 'Old Standard TT', 'Frank Ruhl Libre', 'Gelasio', 'Rokkitt',
  ]],
  ['Títulos y llamativas', [
    'Oswald', 'Bebas Neue', 'Anton', 'Fjalla One', 'Teko', 'Cinzel', 'Abril Fatface', 'DM Serif Display', 'Yeseva One', 'Bree Serif', 'Bangers', 'Righteous', 'Fredoka', 'Baloo 2',
    'Chewy', 'Orbitron', 'Press Start 2P', 'Special Elite', 'UnifrakturCook',
  ]],
  ['Monoespaciadas', ['Source Code Pro', 'Fira Code', 'JetBrains Mono', 'IBM Plex Mono', 'Roboto Mono', 'Space Mono', 'Inconsolata', 'Ubuntu Mono', 'DM Mono', 'Anonymous Pro', 'PT Mono']],
  ['Manuscritas', [
    'Caveat', 'Pacifico', 'Dancing Script', 'Lobster', 'Satisfy', 'Great Vibes', 'Indie Flower', 'Shadows Into Light', 'Permanent Marker', 'Amatic SC', 'Kalam', 'Patrick Hand',
    'Courgette', 'Sacramento', 'Architects Daughter', 'Gloria Hallelujah', 'Yellowtail', 'Cookie', 'Rock Salt', 'Handlee',
  ]],
]

export const fontsourceId = (name: string) => name.toLowerCase().replace(/ /g, '-')

export const FONT_GROUPS: [string, string[]][] = [['Del sistema', SYSTEM_FONTS], ...BUNDLED_GROUPS]
