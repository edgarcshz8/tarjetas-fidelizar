import Link from 'next/link'

export const metadata = {
  title: 'Términos y Condiciones — Tarjetas de Fidelización',
}

export default function TerminosYCondiciones() {
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <div className="mb-8">
          <Link
            href="javascript:history.back()"
            className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 transition"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Volver
          </Link>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 md:p-12">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Términos y Condiciones</h1>
          <p className="text-sm text-slate-400 mb-8">Última actualización: noviembre 2026</p>

          <div className="prose prose-slate max-w-none space-y-8 text-slate-700 leading-relaxed">

            <section>
              <h2 className="text-xl font-semibold text-slate-800 mb-3">1. Aceptación de los términos</h2>
              <p>
                Al registrarte y utilizar nuestro programa de tarjetas de fidelización, aceptas quedar vinculado por
                estos Términos y Condiciones. Si no estás de acuerdo con alguno de ellos, te pedimos que no utilices
                el servicio.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-slate-800 mb-3">2. Descripción del servicio</h2>
              <p>
                El programa de fidelización digital permite a los clientes acumular sellos virtuales por cada compra
                o visita al establecimiento comercial participante. Al completar el número de sellos requerido, el
                cliente obtiene el premio o beneficio establecido por el negocio.
              </p>
              <p className="mt-3">
                Las tarjetas se entregan en formato digital compatible con Apple Wallet y Google Wallet. No se emiten
                tarjetas físicas.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-slate-800 mb-3">3. Registro y datos del usuario</h2>
              <p>
                Para participar en el programa debes proporcionar tu nombre completo y correo electrónico válido.
                El número de teléfono es opcional. Eres responsable de la exactitud de los datos que ingreses.
              </p>
              <p className="mt-3">
                Cada persona puede registrarse una sola vez por programa de fidelización. El uso fraudulento
                o duplicado de registros puede resultar en la cancelación de los beneficios acumulados.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-slate-800 mb-3">4. Acumulación de sellos y premios</h2>
              <ul className="list-disc pl-5 space-y-2">
                <li>Los sellos solo pueden ser otorgados por personal autorizado del establecimiento.</li>
                <li>Los sellos no son transferibles ni canjeables por dinero en efectivo.</li>
                <li>El premio es el establecido por el negocio participante y puede cambiar sin previo aviso.</li>
                <li>Los sellos acumulados no tienen fecha de vencimiento, salvo que el negocio indique lo contrario.</li>
                <li>El canje del premio implica el reinicio del contador de sellos a cero.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-slate-800 mb-3">5. Responsabilidad del negocio</h2>
              <p>
                Cada negocio participante es responsable exclusivo de los premios ofrecidos y de la validez de
                su programa de fidelización. La plataforma actúa únicamente como intermediario tecnológico y no
                garantiza la disponibilidad ni el cumplimiento de los premios por parte del negocio.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-slate-800 mb-3">6. Modificaciones</h2>
              <p>
                Nos reservamos el derecho de modificar estos Términos y Condiciones en cualquier momento. Los cambios
                entrarán en vigor desde su publicación en esta página. El uso continuado del servicio implica la
                aceptación de los términos actualizados.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-slate-800 mb-3">7. Cancelación</h2>
              <p>
                Puedes solicitar la eliminación de tu cuenta y datos en cualquier momento escribiendo a nuestro
                correo de contacto. La cancelación implica la pérdida de todos los sellos acumulados.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-slate-800 mb-3">8. Ley aplicable</h2>
              <p>
                Estos términos se rigen por las leyes de la República de Chile. Cualquier controversia será sometida
                a los tribunales competentes del domicilio del prestador del servicio.
              </p>
            </section>

          </div>
        </div>
      </div>
    </div>
  )
}
