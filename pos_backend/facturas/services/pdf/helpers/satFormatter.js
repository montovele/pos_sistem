// facturas/services/pdf/helpers/satFormatter.js

// ======================================================
// UUID
// ======================================================

export function formatUUID(
  uuid = ''
) {
  return String(uuid)
    .trim()
    .toUpperCase()
}

// ======================================================
// RFC
// ======================================================

export function formatRFC(
  rfc = ''
) {
  return String(rfc)
    .trim()
    .toUpperCase()
}

// ======================================================
// FECHA SAT
// ======================================================

export function formatDateSAT(
  value
) {

  if (!value) {
    return '-'
  }

  const date =
    value instanceof Date
      ? value
      : new Date(value)

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return '-'
  }

  return date.toLocaleString(
    'es-MX',
    {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',

      hour: '2-digit',
      minute: '2-digit',

      second: '2-digit',

      hour12: false,
    }
  )

}