import type { ReactNode } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { AlertTriangle } from 'lucide-react'
import { LEGAL, missingLegalData } from '../legal.config'

const FIELD_NAME = { owner: 'nombre o razón social', taxId: 'NIF/CIF', address: 'domicilio', email: 'correo de contacto' }

const tab = ({ isActive }: { isActive: boolean }) => `rounded-full px-4 py-2 text-sm font-semibold ${isActive ? 'bg-ink text-white' : 'bg-white hover:bg-ink/5'}`

function Doc({ title, children }: { title: string; children: ReactNode }) {
  const missing = missingLegalData()
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <nav className="mb-8 flex flex-wrap gap-2" aria-label="Documentos legales">
        <NavLink to="/privacidad" className={tab}>Privacidad</NavLink>
        <NavLink to="/terminos" className={tab}>Términos de uso</NavLink>
        <NavLink to="/aviso-legal" className={tab}>Aviso legal</NavLink>
      </nav>
      {missing.length > 0 && (
        <p role="alert" className="mb-8 flex gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <AlertTriangle size={20} className="shrink-0" />
          <span><b>Faltan datos del titular:</b> {missing.map((k) => FIELD_NAME[k]).join(', ')}. Complétalos en <code>src/legal.config.ts</code> antes de publicar la web.</span>
        </p>
      )}
      <h1 className="text-4xl font-extrabold">{title}</h1>
      <p className="mt-2 text-sm text-ink/55">Última actualización: {LEGAL.updated}</p>
      <div className="mt-8 flex flex-col gap-8 text-[15.5px] leading-relaxed [&_a]:text-brand [&_a]:underline [&_h2]:mb-2 [&_h2]:text-xl [&_h2]:font-bold [&_li]:ml-5 [&_li]:list-disc [&_ul]:mt-2 [&_ul]:flex [&_ul]:flex-col [&_ul]:gap-1.5">
        {children}
      </div>
    </div>
  )
}

const owner = () => LEGAL.owner || '[nombre del titular]'
const mail = () => LEGAL.email || '[correo de contacto]'

function Holder() {
  return (
    <ul>
      <li><b>Titular:</b> {owner()}</li>
      <li><b>NIF/CIF:</b> {LEGAL.taxId || '[NIF/CIF]'}</li>
      <li><b>Domicilio:</b> {LEGAL.address || '[domicilio]'}</li>
      <li><b>Correo:</b> {mail()}</li>
      {LEGAL.registry && <li><b>Registro:</b> {LEGAL.registry}</li>}
    </ul>
  )
}

export function Privacy() {
  return (
    <Doc title="Política de privacidad">
      <section>
        <h2>1. Quién es el responsable</h2>
        <p>El responsable del tratamiento de tus datos es:</p>
        <Holder />
      </section>

      <section>
        <h2>2. Qué datos tratamos y para qué</h2>
        <ul>
          <li><b>Cuenta:</b> tu correo electrónico, tu contraseña (la guardamos solo transformada con un algoritmo de hash, nunca la vemos) y la fecha en que aceptaste los términos. Sirven para crear y mantener tu cuenta. Base jurídica: ejecución del contrato.</li>
          <li><b>Uso del servicio:</b> tu plan, cuántas conversiones haces cada día y cuántos caracteres de IA usas al mes. Sirven para aplicar los límites de cada plan. Base jurídica: ejecución del contrato.</li>
          <li><b>Dirección IP:</b> si usas el servicio sin cuenta, guardamos un contador de uso asociado a tu IP durante un máximo de 2 días para aplicar el límite de invitado. Además, la IP aparece en los registros del servidor, que se conservan temporalmente por seguridad y diagnóstico. Base jurídica: interés legítimo en la seguridad del servicio.</li>
          <li><b>Pagos:</b> los gestiona Stripe. Nosotros no vemos ni guardamos tu tarjeta; conservamos solo el identificador de cliente y de suscripción y su estado. Base jurídica: ejecución del contrato y obligaciones legales.</li>
          <li><b>Correos del servicio:</b> usamos tu correo únicamente para mensajes necesarios (por ejemplo, el enlace para restablecer la contraseña). No enviamos publicidad.</li>
        </ul>
      </section>

      <section>
        <h2>3. Qué pasa con tus archivos</h2>
        <ul>
          <li><b>Procesado:</b> según la herramienta, el archivo se procesa en tu propio equipo (sin llegar a nuestros servidores) o se envía a nuestro servidor, donde se procesa en una carpeta temporal y se borra automáticamente al terminar.</li>
          <li><b>Conservación:</b> no conservamos tus archivos, no los revisamos y no los usamos para ningún otro fin.</li>
          <li><b>Herramientas de IA:</b> se extrae el texto del documento en tu navegador y se envía a nuestro servidor y de ahí a DeepSeek para generar el resultado. Consulta el apartado siguiente.</li>
        </ul>
      </section>

      <section>
        <h2>4. Inteligencia artificial y transferencias internacionales</h2>
        <p>Para resumir, traducir y mejorar conversiones usamos la API de DeepSeek, un proveedor de IA con sede fuera del Espacio Económico Europeo (China). Al usar esas herramientas, el texto de tu documento se transfiere a ese proveedor, que lo procesa según su propia política de privacidad. Esa transferencia se produce solo cuando tú decides usar una herramienta de IA, y la interfaz lo avisa en cada una.</p>
        <p className="mt-2"><b>No uses las herramientas de IA con documentos confidenciales o que contengan datos personales sensibles.</b> El resto de herramientas no envían nada a DeepSeek.</p>
      </section>

      <section>
        <h2>5. Cookies</h2>
        <p>Solo usamos una cookie técnica, <code>fp_session</code>, que mantiene tu sesión iniciada. Es estrictamente necesaria para el servicio, por eso no pedimos consentimiento. No usamos cookies de publicidad ni de analítica.</p>
      </section>

      <section>
        <h2>6. Con quién compartimos datos</h2>
        <ul>
          <li><b>Stripe</b>, para procesar los pagos de la suscripción.</li>
          <li><b>Nuestro proveedor de alojamiento</b> y <b>de correo electrónico</b>, que tratan datos por encargo nuestro.</li>
          <li><b>DeepSeek</b>, solo cuando usas una herramienta de IA y solo con el texto del documento.</li>
        </ul>
        <p className="mt-2">No vendemos tus datos ni los cedemos a terceros con fines comerciales.</p>
      </section>

      <section>
        <h2>7. Cuánto tiempo los conservamos</h2>
        <p>Los datos de tu cuenta, hasta que la borres. Al borrarla desde «Mi cuenta» eliminamos tu correo, tu contraseña y tu historial de uso. Los datos de facturación pueden conservarse el tiempo que exijan las obligaciones fiscales y mercantiles aplicables.</p>
      </section>

      <section>
        <h2>8. Tus derechos</h2>
        <p>Puedes acceder a tus datos, rectificarlos, suprimirlos, limitar u oponerte a su tratamiento y pedir su portabilidad escribiendo a <a href={`mailto:${mail()}`}>{mail()}</a>. Puedes borrar tu cuenta en cualquier momento desde <Link to="/cuenta">Mi cuenta</Link>. Si crees que tus derechos no se han respetado, puedes reclamar ante la Agencia Española de Protección de Datos (<a href="https://www.aepd.es" rel="noreferrer">www.aepd.es</a>).</p>
      </section>

      <section>
        <h2>9. Cambios en esta política</h2>
        <p>Si cambiamos algo importante, lo indicaremos en esta página con una nueva fecha de actualización.</p>
      </section>
    </Doc>
  )
}

export function Terms() {
  return (
    <Doc title="Términos de uso">
      <section>
        <h2>1. Qué es FileProyect</h2>
        <p>FileProyect ofrece herramientas para trabajar con documentos PDF, algunas de ellas con inteligencia artificial. Al crear una cuenta o usar el servicio aceptas estos términos y la <Link to="/privacidad">política de privacidad</Link>. El titular del servicio es {owner()} (ver <Link to="/aviso-legal">aviso legal</Link>).</p>
      </section>

      <section>
        <h2>2. Tu cuenta</h2>
        <p>Debes ser mayor de 14 años y facilitar un correo válido. Eres responsable de mantener en secreto tu contraseña y de lo que ocurra con tu cuenta. Avísanos si sospechas que alguien la usa sin permiso.</p>
      </section>

      <section>
        <h2>3. Uso aceptable</h2>
        <p>No puedes usar el servicio para:</p>
        <ul>
          <li>Actividades ilegales o para vulnerar derechos de terceros.</li>
          <li>Sobrecargar o atacar el servidor, ni eludir los límites de tu plan con medios automatizados.</li>
          <li>Subir archivos con virus o contenido malicioso.</li>
          <li>Revender el servicio o ofrecerlo a terceros como propio.</li>
        </ul>
        <p className="mt-2">Podemos limitar o suspender el acceso si se incumple esta cláusula.</p>
      </section>

      <section>
        <h2>4. Planes y límites</h2>
        <p>Hay tres niveles: invitado, gratuito con cuenta y Pro de pago. Las herramientas básicas no tienen límite. Las conversiones avanzadas (por ejemplo, a Word, Excel o PowerPoint, comprimir o proteger) y las de IA tienen límites diarios o mensuales que se detallan en la página de <Link to="/precios">precios</Link> y en «Mi cuenta». Podemos ajustar los límites del plan gratuito avisando con antelación razonable.</p>
      </section>

      <section>
        <h2>5. Suscripción Pro</h2>
        <ul>
          <li>El precio es el indicado en la página de precios, con impuestos incluidos, y se cobra por adelantado a través de Stripe.</li>
          <li>La suscripción se renueva automáticamente cada mes o cada año, según el periodo elegido, hasta que la canceles.</li>
          <li>Puedes cancelar en cualquier momento desde «Mi cuenta» → «Gestionar suscripción». Mantendrás Pro hasta el final del periodo ya pagado y no se renovará. No reembolsamos periodos ya iniciados, salvo lo que la ley obligue.</li>
          <li><b>Derecho de desistimiento:</b> si eres consumidor, puedes desistir del contrato en 14 días naturales desde la contratación. Si has pedido que el servicio empiece de inmediato, deberás pagar la parte proporcional de lo usado hasta que nos comuniques el desistimiento.</li>
          <li>Si el pago falla, tu plan pasará a gratuito tras un breve periodo de gracia.</li>
        </ul>
      </section>

      <section>
        <h2>6. Tus archivos</h2>
        <p>Tus archivos son tuyos. Nos das permiso únicamente para procesarlos con la herramienta que elijas. Los archivos enviados al servidor se borran al terminar el procesado; no los conservamos ni los revisamos. Tú eres responsable de tener derecho a usar los documentos que procesas.</p>
      </section>

      <section>
        <h2>7. Resultados e inteligencia artificial</h2>
        <p>Las conversiones (por ejemplo, de PDF a Word o PowerPoint) son aproximadas y pueden alterar el formato. Los resúmenes, traducciones y textos generados por IA pueden contener errores u omisiones: revísalos antes de usarlos y no los uses como única base para decisiones médicas, legales, financieras o de otro tipo importante. Guarda siempre una copia de tus originales.</p>
      </section>

      <section>
        <h2>8. Disponibilidad y responsabilidad</h2>
        <p>Ofrecemos el servicio «tal cual», sin garantizar que esté libre de interrupciones o errores. En la medida que permita la ley, no respondemos de daños indirectos ni de la pérdida de datos o beneficios derivados del uso del servicio. Esto no limita los derechos que la ley reconoce a los consumidores, ni la responsabilidad por dolo o negligencia grave.</p>
      </section>

      <section>
        <h2>9. Baja y cambios</h2>
        <p>Puedes borrar tu cuenta cuando quieras. Podemos modificar estos términos; si el cambio es relevante te lo comunicaremos y, si no estás de acuerdo, podrás darte de baja y cancelar tu suscripción.</p>
      </section>

      <section>
        <h2>10. Ley aplicable</h2>
        <p>Estos términos se rigen por la ley española. Si eres consumidor, serás atendido por los tribunales de tu domicilio, conforme a la normativa de consumidores. Para cualquier duda escríbenos a <a href={`mailto:${mail()}`}>{mail()}</a>.</p>
      </section>
    </Doc>
  )
}

export function LegalNotice() {
  return (
    <Doc title="Aviso legal">
      <section>
        <h2>1. Datos del titular</h2>
        <p>En cumplimiento de la Ley 34/2002 de servicios de la sociedad de la información y de comercio electrónico (LSSI), se informa de que el titular de este sitio web es:</p>
        <Holder />
      </section>

      <section>
        <h2>2. Objeto</h2>
        <p>Este sitio ofrece herramientas online para trabajar con documentos PDF, con un plan gratuito y un plan de pago. El uso del sitio atribuye la condición de usuario e implica la aceptación de los <Link to="/terminos">términos de uso</Link>.</p>
      </section>

      <section>
        <h2>3. Propiedad intelectual</h2>
        <p>El diseño, los textos, la marca y el código propio del sitio pertenecen a su titular. El sitio utiliza componentes de software libre, que se rigen por sus respectivas licencias. Los documentos que procesas son de tu propiedad.</p>
      </section>

      <section>
        <h2>4. Responsabilidad</h2>
        <p>El titular no se hace responsable del uso que los usuarios hagan de las herramientas ni de los contenidos que procesen. Tampoco responde de los contenidos de sitios de terceros enlazados.</p>
      </section>

      <section>
        <h2>5. Legislación y contacto</h2>
        <p>Este aviso se rige por la legislación española. Puedes contactar con nosotros en <a href={`mailto:${mail()}`}>{mail()}</a>.</p>
      </section>
    </Doc>
  )
}
