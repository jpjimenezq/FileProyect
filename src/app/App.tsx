import { Suspense, lazy, useEffect } from 'react'
import { Route, Routes, useLocation } from 'react-router-dom'
import { Header } from './Header'
import { Footer } from './Footer'
import { Home } from '../pages/Home'
import { Account, ResetPassword } from '../pages/Account'
import { LegalNotice, Privacy, Terms } from '../pages/Legal'
import { Pricing } from '../pages/Pricing'
import { ComingSoon } from '../pages/ComingSoon'
import { implemented } from '../tools/registry'
import { tools } from '../tools/catalog'
import { Taller } from '../pages/taller/Taller'

const DocEditor = lazy(() => import('../pages/taller/DocEditor'))
const SheetEditor = lazy(() => import('../pages/taller/SheetEditor'))

export default function App() {
  const { pathname, hash } = useLocation()
  useEffect(() => {
    if (!hash) {
      window.scrollTo(0, 0)
      return
    }
    // las rutas se cargan de forma diferida: se espera un instante a que exista el destino del ancla
    const t = setTimeout(() => document.getElementById(hash.slice(1))?.scrollIntoView(), 50)
    return () => clearTimeout(t)
  }, [pathname, hash])

  return (
    <>
      <Header />
      <main>
        <Suspense fallback={<p className="py-24 text-center text-ink/50">Cargando…</p>}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/precios" element={<Pricing />} />
            <Route path="/cuenta" element={<Account />} />
            <Route path="/cuenta/restablecer" element={<ResetPassword />} />
            <Route path="/privacidad" element={<Privacy />} />
            <Route path="/terminos" element={<Terms />} />
            <Route path="/taller" element={<Taller />} />
            <Route path="/taller/documento" element={<DocEditor />} />
            <Route path="/taller/hoja" element={<SheetEditor />} />
            <Route path="/aviso-legal" element={<LegalNotice />} />
            {tools.map((t) => {
              const Tool = implemented[t.id]
              return <Route key={t.id} path={t.path} element={Tool ? <Tool /> : <ComingSoon tool={t} />} />
            })}
            <Route path="*" element={<p className="py-24 text-center text-ink/50">Página no encontrada.</p>} />
          </Routes>
        </Suspense>
      </main>
      <Footer />
    </>
  )
}
