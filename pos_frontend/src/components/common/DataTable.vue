<template>
  <div class="data-table">
    <table class="table">
      <thead v-if="!hideHeader">
        <tr>
          <th v-for="column in columns" :key="column.key">
            {{ column.label }}
          </th>
          <th v-if="$slots.actions">Acciones</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(row, index) in rows" :key="index">
          <td v-for="column in columns" :key="column.key">
            <slot :name="`cell-${column.key}`" :row="row" :value="row[column.key]">
              {{ formatValue(row[column.key], column.format) }}
            </slot>
          </td>
          <td v-if="$slots.actions" class="actions">
            <slot name="actions" :row="row"></slot>
          </td>
        </tr>
        <tr v-if="rows.length === 0" class="empty-row">
          <td :colspan="columns.length + ($slots.actions ? 1 : 0)" class="empty-message">
            No data available
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
import { formatCurrency, formatDate } from '@/utils/helpers'

interface Column {
  key: string
  label: string
  format?: 'currency' | 'date' | 'number'
}

withDefaults(
  defineProps<{
    columns: Column[]
    rows: any[]
    hideHeader?: boolean
  }>(),
  {
    hideHeader: false
  }
)

const formatValue = (value: any, format?: string): string => {
  if (value === null || value === undefined) return '-'

  switch (format) {
    case 'currency':
      return formatCurrency(Number(value))
    case 'date':
      return formatDate(value)
    case 'number':
      return Number(value).toLocaleString()
    default:
      return String(value)
  }
}
</script>

<style scoped>
.data-table {
  max-height: min(42vh, 420px);
  overflow: auto;
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  border: 1px solid #edf1f5;
}

.table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
}

.table thead {
  background-color: #f5f5f5;
  position: sticky;
  top: 0;
  z-index: 1;
}

.table th {
  padding: 1rem;
  text-align: left;
  font-weight: 600;
  color: #2c3e50;
  border-bottom: 2px solid #ddd;
  white-space: nowrap;
}

.table td {
  padding: 1rem;
  border-bottom: 1px solid #eee;
}

.table tbody tr:hover {
  background-color: #fafafa;
}

.empty-row {
  background-color: #f9f9f9;
}

.empty-message {
  text-align: center;
  color: #999;
  font-style: italic;
}

.actions {
  text-align: center;
  white-space: nowrap;
}

@media (max-width: 768px) {
  .table {
    font-size: 0.875rem;
  }

  .table th,
  .table td {
    padding: 0.75rem;
  }
}
</style>
