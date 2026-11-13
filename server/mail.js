import nodemailer from 'nodemailer'

/**
 * Envío de correo por SMTP. Variables:
 *   SMTP_URL   p. ej. smtps://usuario:clave@smtp.proveedor.com:465
 *   MAIL_FROM  p. ej. "FileProyect <no-reply@tudominio.com>"
 * Sin SMTP_URL: en desarrollo el enlace se escribe en la consola del servidor; en producción no se envía nada.
 */
export function createMailer(log = console) {
  let transport
  return {
    configured: () => Boolean(process.env.SMTP_URL),
    async send({ to, subject, text, html }) {
      if (!process.env.SMTP_URL) {
        if (process.env.NODE_ENV !== 'production') log.info?.({ to, subject }, `[correo no enviado: falta SMTP_URL]\n${text}`)
        else log.error?.('No se pudo enviar un correo: falta SMTP_URL')
        return false
      }
      transport ??= nodemailer.createTransport(process.env.SMTP_URL)
      await transport.sendMail({ from: process.env.MAIL_FROM || 'FileProyect <no-reply@localhost>', to, subject, text, html })
      return true
    },
  }
}

const escapeHtml = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

export function resetEmail(link) {
  const text = `Hola,\n\nHas pedido restablecer tu contraseña de FileProyect. Abre este enlace (caduca en 1 hora):\n\n${link}\n\nSi no has sido tú, ignora este mensaje: tu contraseña no cambiará.\n`
  const html = `<p>Hola,</p><p>Has pedido restablecer tu contraseña de FileProyect. Pulsa el botón (caduca en 1 hora):</p><p><a href="${escapeHtml(link)}" style="background:#5b4bff;color:#fff;padding:12px 20px;border-radius:12px;text-decoration:none;font-weight:600">Elegir nueva contraseña</a></p><p style="color:#666">Si no has sido tú, ignora este mensaje: tu contraseña no cambiará.</p>`
  return { subject: 'Restablece tu contraseña de FileProyect', text, html }
}
