// facturas/services/pdf/helpers/currency.js
export function formatCurrency(
  value = 0
) {

  return new Intl.NumberFormat(
    'es-MX',
    {
      style: 'currency',
      currency: 'MXN',
    }
  ).format(value)

}