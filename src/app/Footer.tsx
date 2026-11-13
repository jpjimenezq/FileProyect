import { Link } from 'react-router-dom'
import { Logo } from './Logo'

export function Footer() {
  return (
    <footer className="mt-20 border-t border-line bg-white">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <Logo />
          <p className="mt-3 max-w-xs text-sm text-ink/60">Herramientas PDF sin anuncios ni marcas de agua, que no conservan tus archivos.</p>
        </div>
        <div>
          <h3 className="mb-3 font-display text-sm font-bold uppercase tracking-wider text-ink/50">Herramientas</h3>
          <ul className="flex flex-col gap-2 text-sm">
            <li><Link className="hover:text-brand" to="/unir-pdf">Unir PDF</Link></li>
            <li><Link className="hover:text-brand" to="/dividir-pdf">Dividir PDF</Link></li>
            <li><Link className="hover:text-brand" to="/comprimir-pdf">Comprimir PDF</Link></li>
            <li><Link className="hover:text-brand" to="/resumir-pdf">Resumir con IA</Link></li>
          </ul>
        </div>
        <div>
          <h3 className="mb-3 font-display text-sm font-bold uppercase tracking-wider text-ink/50">Cuenta</h3>
          <ul className="flex flex-col gap-2 text-sm">
            <li><Link className="hover:text-brand" to="/precios">Precios</Link></li>
            <li><Link className="hover:text-brand" to="/cuenta">Mi cuenta</Link></li>
            <li><Link className="hover:text-brand" to="/cuenta?registro=1">Crear cuenta gratis</Link></li>
          </ul>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 border-t border-line px-4 py-5 text-xs text-ink/50">
        <span>© {new Date().getFullYear()} FileProyect</span>
        <Link className="hover:text-brand" to="/privacidad">Privacidad</Link>
        <Link className="hover:text-brand" to="/terminos">Términos</Link>
        <Link className="hover:text-brand" to="/aviso-legal">Aviso legal</Link>
      </div>
    </footer>
  )
}
