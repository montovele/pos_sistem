import test from 'node:test'
import assert from 'node:assert/strict'

import {
  formatDisplayMoney,
  formatReportDate,
  normalizeReportStatus,
  summarizePaymentMethods
} from './src/composables/reportPdf.ts'

test('formatDisplayMoney formats MXN values consistently', () => {
  assert.equal(formatDisplayMoney(427.96), '$427.96')
  assert.equal(formatDisplayMoney(0), '$0.00')
})

test('formatReportDate formats ISO values for users', () => {
  assert.equal(formatReportDate('2026-09-19T22:32:26.817Z'), '19/09/2026 22:32')
})

test('normalizeReportStatus converts technical statuses into user-friendly labels', () => {
  assert.equal(normalizeReportStatus('completed'), 'Completada')
  assert.equal(normalizeReportStatus('pending'), 'Pendiente')
  assert.equal(normalizeReportStatus('SIN ARQUEO'), 'Sin arqueo')
})

test('summarizePaymentMethods groups totals by method', () => {
  const result = summarizePaymentMethods([
    { total: 100, paymentMethod: 'cash' },
    { total: 50, paymentMethod: 'cash' },
    { total: 75, paymentMethod: 'card' }
  ] as any)

  assert.deepEqual(result, [
    { label: 'Efectivo', count: 2, total: 150 },
    { label: 'Tarjeta', count: 1, total: 75 }
  ])
})
