/**
 * Datos del titular del servicio. Son obligatorios por ley (LSSI, art. 10) cuando la web tiene actividad
 * económica, y aparecen en el aviso legal, los términos y la política de privacidad.
 * Rellénalos ANTES de publicar: mientras falten, las páginas legales muestran un aviso.
 */
export const LEGAL = {
  /** Nombre y apellidos o razón social */
  owner: '',
  /** NIF / CIF */
  taxId: '',
  /** Domicilio completo */
  address: '',
  /** Correo de contacto (también para ejercer derechos de protección de datos) */
  email: '',
  /** Registro mercantil u otros datos, si procede */
  registry: '',
  /** Última revisión de los textos */
  updated: '22 de octubre de 2026',
}

export const missingLegalData = () =>
  (['owner', 'taxId', 'address', 'email'] as const).filter((k) => !LEGAL[k].trim())
