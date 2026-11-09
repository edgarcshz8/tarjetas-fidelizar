import Link from 'next/link'

export const metadata = {
  title: 'Política de Privacidad — Tarjetas de Fidelización',
}

export default function PoliticaDePrivacidad() {
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
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Política de Privacidad</h1>
          <p className="text-sm text-slate-400 mb-8">Última actualización: noviembre 2026</p>

          <div className="prose prose-slate max-w-none space-y-8 text-slate-700 leading-relaxed">

            <section>
              <h2 className="text-xl font-semibold text-slate-800 mb-3">1. Responsable del tratamiento</h2>
              <p>
                El responsable del tratamiento de tus datos personales es el negocio al que pertenece el programa
                de fidelización en el que te registras, con apoyo técnico de la plataforma de tarjetas digitales.
                Para consultas relacionadas con tus datos puedes contactarnos a través del correo del establecimiento
                o del correo de soporte de la plataforma.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-slate-800 mb-3">2. Datos que recopilamos</h2>
              <p>Recopilamos únicamente los datos necesarios para operar el programa de fidelización:</p>
              <ul className="list-disc pl-5 space-y-2 mt-3">
                <li><strong>Nombre completo:</strong> para personalizar tu tarjeta y comunicaciones.</li>
                <li><strong>Correo electrónico:</strong> para enviarte tu tarjeta digital y notificaciones del programa.</li>
                <li><strong>Teléfono (opcional):</strong> para comunicaciones adicionales si el negocio lo requiere.</li>
                <li><strong>Historial de sellos:</strong> número de sellos acumulados y fecha de cada canje.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-slate-800 mb-3">3. Finalidad del tratamiento</h2>
              <p>Tus datos se utilizan exclusivamente para:</p>
              <ul className="list-disc pl-5 space-y-2 mt-3">
                <li>Generar y entregar tu tarjeta de fidelización digital (Apple Wallet / Google Wallet).</li>
                <li>Registrar el avance de tus sellos y premios canjeados.</li>
                <li>Enviarte notificaciones sobre tu tarjeta y el programa de fidelización.</li>
                <li>Comunicarte beneficios o novedades del negocio participante, si aceptaste recibirlas.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-slate-800 mb-3">4. Base legal del tratamiento</h2>
              <p>
                El tratamiento se basa en el consentimiento que otorgas al momento de registrarte, y en la
                necesidad de ejecutar el servicio de fidelización que solicitas. Tienes derecho a retirar tu
                consentimiento en cualquier momento, lo que implicará la eliminación de tus datos y la pérdida
                de los beneficios acumulados.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-slate-800 mb-3">5. Compartición de datos con terceros</h2>
              <p>
                Tus datos no se venden ni se comparten con terceros con fines comerciales. Para el funcionamiento
                del servicio, tus datos pueden ser procesados por:
              </p>
              <ul className="list-disc pl-5 space-y-2 mt-3">
                <li><strong>Apple Inc.</strong> — para la entrega de pases a través de Apple Wallet.</li>
                <li><strong>Google LLC</strong> — para la entrega de tarjetas a través de Google Wallet.</li>
                <li><strong>Proveedor de hosting/base de datos</strong> — para el almacenamiento seguro de la información.</li>
              </ul>
              <p className="mt-3">
                Todos los proveedores actúan bajo acuerdos de procesamiento de datos y están sujetos a sus
                propias políticas de privacidad.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-slate-800 mb-3">6. Conservación de los datos</h2>
              <p>
                Conservamos tus datos mientras tengas una tarjeta activa en el programa. Si solicitas la eliminación
                de tu cuenta, borraremos tus datos en un plazo máximo de 30 días hábiles.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-slate-800 mb-3">7. Tus derechos</h2>
              <p>Tienes derecho a:</p>
              <ul className="list-disc pl-5 space-y-2 mt-3">
                <li><strong>Acceso:</strong> solicitar qué datos tenemos sobre ti.</li>
                <li><strong>Rectificación:</strong> corregir datos incorrectos o incompletos.</li>
                <li><strong>Supresión:</strong> solicitar la eliminación de tus datos.</li>
                <li><strong>Portabilidad:</strong> recibir tus datos en formato legible por máquina.</li>
                <li><strong>Oposición:</strong> oponerte al tratamiento de tus datos para comunicaciones comerciales.</li>
              </ul>
              <p className="mt-3">
                Para ejercer cualquiera de estos derechos puedes escribirnos al correo de soporte de la plataforma.
                Responderemos en un plazo máximo de 15 días hábiles.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-slate-800 mb-3">8. Seguridad</h2>
              <p>
                Aplicamos medidas técnicas y organizativas para proteger tus datos frente a accesos no autorizados,
                pérdida o divulgación. La información se transmite siempre mediante conexiones cifradas (HTTPS) y
                se almacena en servidores seguros.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-slate-800 mb-3">9. Cambios en esta política</h2>
              <p>
                Podemos actualizar esta política periódicamente. Te notificaremos por correo electrónico ante
                cambios significativos. La versión vigente siempre estará disponible en esta página.
              </p>
            </section>

          </div>
        </div>
      </div>
    </div>
  )
}
