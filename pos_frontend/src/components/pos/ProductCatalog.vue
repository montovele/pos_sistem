<template>
  <div class="product-catalog">
    <div class="catalog-toolbar">
      <div class="toolbar-left">
        <div class="search-input-wrapper">
          <span class="search-icon" aria-hidden="true">⌕</span>
          <input
            v-model="searchQuery"
            @input="handleSearch"
            type="text"
            :placeholder="searchPlaceholder"
            class="search-input"
            autocomplete="off"
          />
          <button v-if="searchQuery" class="clear-search" type="button" aria-label="Limpiar búsqueda" @click="handleClearSearch">✕</button>
          <button class="scan-hint" type="button" aria-label="Escanear producto">▥</button>
        </div>
      </div>

      <div class="toolbar-right">
        <div class="category-tabs" aria-label="Categorías de productos">
          <button class="category-tab" :class="{ active: selectedCategory === 'all' }" type="button" @click="selectedCategory = 'all'">Todos</button>
          <button
            v-for="category in categories"
            :key="category"
            class="category-tab"
            :class="{ active: selectedCategory === category }"
            type="button"
            @click="selectCategory(category)"
          >
            {{ category }}
          </button>
        </div>
      </div>
    </div>

    <div class="catalog-meta">
      <div class="results-info" aria-live="polite">
        <span v-if="!isLoading">{{ filteredProducts.length }} productos</span>
        <span v-else><span class="loading-dot"></span>Buscando...</span>
      </div>
    </div>

    <!-- Alert de error -->
    <Alert
      v-if="displayError"
      :message="displayError"
      type="error"
      dismissible
      @close="error = ''"
    />

    <!-- Loading state -->
    <div v-if="isLoading" class="loading-state">
      <div class="spinner"></div>
      <p>Cargando productos...</p>
    </div>

    <!-- Grid de productos -->
    <div v-else class="catalog-sections">
      <div v-if="filteredProducts.length === 0" class="empty-state">
        <p>📦 No se encontraron productos</p>
        <p class="empty-text">{{ searchQuery ? 'Intenta otra búsqueda' : 'Recargando catálogo...' }}</p>
      </div>

      <section
        v-for="group in groupedProducts"
        v-show="group.products.length > 0"
        :key="group.key"
        class="unit-section"
      >
        <div class="unit-section-header">
          <span class="unit-section-title">{{ group.title }}</span>
          <span class="unit-section-count">{{ group.products.length }}</span>
        </div>

        <div class="products-grid">
          <div
            v-for="product in group.products"
            :key="product.id || product.codigoProd"
            :class="['product-card', { 'is-adding': addingProductId === product.id }]"
            @click="selectProduct(product)"
          >
            <div class="product-image" :class="{ 'has-image': product.image }">
              <img v-if="product.image" :src="product.image" :alt="productName(product)" loading="lazy" />
              <span v-else class="product-placeholder" aria-hidden="true">▦</span>
            </div>

            <div class="product-identity">
              <div class="product-code">{{ productCode(product) }}</div>
              <span v-if="productCategory(product)" class="product-category">
                {{ productCategory(product) }}
              </span>
            </div>

            <h3 class="product-name">
              {{ productName(product) }}
            </h3>

            <p class="product-description">
              {{ productDescription(product) }}
            </p>

            <div class="product-meta">
              <span class="stock-indicator" :class="{ low: productStock(product) < 10, out: productStock(product) <= 0 }">
                {{ stockLabel(product) }}
              </span>
              <span class="product-unit">{{ productUnit(product) }}</span>
            </div>

            <div class="product-footer">
              <div class="product-price-block">
                <small>{{ productUnit(product) === 'KG' ? 'Precio / kg' : 'Precio' }}</small>
                <span class="product-price">{{ formatCurrency(productPrice(product)) }}</span>
              </div>
              <button
                :class="['add-btn', { 'is-added': addedProductId === product.id }]"
                @click.stop="addToCart(product)"
                :disabled="productStock(product) <= 0"
              >
                {{ addedProductId === product.id ? 'Agregado' : (productStock(product) <= 0 ? 'Sin stock' : (isWeightedProduct(product) ? 'Pesar' : 'Agregar')) }}
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>

    <!-- Paginación info -->
    <div v-if="!isLoading && filteredProducts.length > 0" class="pagination-info">
      <span class="pagination-count">
        Página {{ productStore.currentPage }} de {{ productStore.totalPages || 1 }} · {{ productStore.total }} productos
      </span>
      <div class="pagination-controls" aria-label="Paginación de productos">
        <button type="button" :disabled="productStore.currentPage <= 1" @click="changePage(productStore.currentPage - 1)">Anterior</button>
        <button type="button" :disabled="productStore.currentPage >= productStore.totalPages" @click="changePage(productStore.currentPage + 1)">Siguiente</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, watch } from 'vue'
import { useCartStore } from '@/stores/cartStore'
import { useProductStore } from '@/stores/productStore'
import { formatCurrency, getProductPrice, getProductUnit, isWeightedProduct } from '@/utils/helpers'
import Alert from '@/components/common/Alert.vue'
import type { Product } from '@/types'

const emit = defineEmits<{
  select: [product: Product]
  add: [product: Product]
}>()

// Stores
const cartStore = useCartStore()
const productStore = useProductStore()

// Estado local
const searchQuery = ref('')
const searchType = ref<'code' | 'name' | 'all'>('all')
const debounceTimer = ref<ReturnType<typeof setTimeout> | null>(null)
const error = ref('')
const selectedCategory = ref('all')
const addingProductId = ref<number | null>(null)
const addedProductId = ref<number | null>(null)

// Computed
const searchPlaceholder = computed(() => {
  switch (searchType.value) {
    case 'code':
      return 'Buscar por código...'
    case 'name':
      return 'Buscar por nombre...'
    default:
      return 'Buscar producto...'
  }
})

const filteredProducts = computed(() => {
  return selectedCategory.value === 'all'
    ? productStore.products
    : productStore.products.filter(product => (product.category || 'Otros') === selectedCategory.value)
})

const groupedProducts = computed(() => {
  const groups: Record<'KG' | 'PZA', Product[]> = { KG: [], PZA: [] }

  for (const product of filteredProducts.value) {
    const unit = getProductUnit(product)
    groups[unit].push(product)
  }

  return [
    { key: 'KG', title: 'Productos por kg', products: groups.KG },
    { key: 'PZA', title: 'Productos por pieza', products: groups.PZA }
  ]
})

const categories = computed(() => {
  const values = productStore.products.map(product => product.category || 'Otros')
  return [...new Set(values)].slice(0, 7)
})

const isLoading = computed(() => productStore.isLoading)
const displayError = computed(() => error.value || productStore.error || '')

const productName = (product: Product) => String(
  product.nombreProd || (product as Product & { nombre?: string; name?: string }).nombre || (product as Product & { name?: string }).name || 'Producto sin nombre'
)

const productCode = (product: Product) => String(
  product.codigoProd || product.codigoAltern || (product as Product & { code?: string }).code || 'Sin código'
)

const productCategory = (product: Product) => String(
  product.category || (product as Product & { categoria?: string }).categoria || ''
)

const productDescription = (product: Product) => String(
  product.description || (product as Product & { descripcion?: string }).descripcion || 'Sin descripción disponible'
)

const productPrice = (product: Product) => Number(
  getProductPrice(product)
)

const productStock = (product: Product) => Number(
  product.stock ?? (product as Product & { existencia?: number; cantidadStock?: number }).existencia ?? (product as Product & { cantidadStock?: number }).cantidadStock ?? 0
)

const productUnit = (product: Product) => {
  return getProductUnit(product)
}

const stockLabel = (product: Product) => {
  if (productUnit(product) === 'KG') return `${productStock(product).toFixed(2)} kg disponibles`
  return `${productStock(product)} disponibles`
}

// Métodos
const reloadCatalog = async () => {
  searchQuery.value = ''
  selectedCategory.value = 'all'
  error.value = ''
  if (debounceTimer.value) {
    clearTimeout(debounceTimer.value)
  }
  await productStore.loadProducts(1)
}

watch(
  () => searchQuery.value,
  async (query) => {
    error.value = ''

    if (debounceTimer.value) {
      clearTimeout(debounceTimer.value)
    }

    debounceTimer.value = setTimeout(async () => {
      try {
        if (!query || !query.trim()) {
          await reloadCatalog()
          return
        }

        const response = await productStore.searchProducts(query.trim(), 1)
        if (!response.data.length) {
          await reloadCatalog()
        }
      } catch (err) {
        error.value = err instanceof Error ? err.message : 'Error en búsqueda'
        await reloadCatalog()
      }
    }, 400)
  }
)

const handleSearch = (event: Event) => {
  const value = (event.target as HTMLInputElement).value
  searchQuery.value = value
}

const handleClearSearch = () => {
  searchQuery.value = ''
  void reloadCatalog()
}

const selectCategory = (category: string) => {
  selectedCategory.value = category
}

const changePage = async (page: number) => {
  if (page < 1 || page > productStore.totalPages) return

  try {
    if (searchQuery.value.trim()) {
      await productStore.searchProducts(searchQuery.value.trim(), page)
    } else {
      await productStore.loadProducts(page)
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'No se pudo cambiar de página'
  }
}

const selectProduct = (product: Product) => {
  if (isWeightedProduct(product)) {
    emit('select', product)
    return
  }

  addToCart(product)
  emit('select', product)
}

const addToCart = (product: Product) => {
  const legacyProduct = product as Product & { unidad?: string }
  const isWeightSale = isWeightedProduct(product) || ['KG', 'G', 'GR', 'GRAMOS'].includes(String(legacyProduct?.unit ?? legacyProduct?.unidad ?? '').trim().toUpperCase())
  const stock = productStock(product)

  if (isWeightSale) {
    emit('select', product)
    return
  }

  if (stock <= 0) return

  cartStore.addItem(product, 1)
  addingProductId.value = product.id
  addedProductId.value = product.id
  window.setTimeout(() => {
    if (addingProductId.value === product.id) addingProductId.value = null
  }, 450)
  window.setTimeout(() => {
    if (addedProductId.value === product.id) addedProductId.value = null
  }, 900)
  emit('add', product)
}

const getTabLabel = (type: string): string => {
  const labels: Record<string, string> = {
    all: 'Todo',
    code: 'Código',
    name: 'Nombre'
  }
  return labels[type] || type
}

// Lifecycle
onMounted(() => {
  void productStore.loadProducts(1)
})
</script>

<style scoped>
.product-catalog {
  display: flex;
  flex-direction: column;
  gap: 0.38rem;
  min-height: 0;
  min-width: 0;
  height: 100%;
  overflow: hidden;
  touch-action: manipulation;
}

.catalog-toolbar {
  display: grid;
  grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr);
  align-items: stretch;
  gap: 0.26rem;
  width: 100%;
}

.toolbar-left,
.toolbar-right {
  min-width: 0;
  display: flex;
  align-items: stretch;
}

.search-input-wrapper {
  display: flex;
  align-items: center;
  width: 100%;
  min-width: 0;
  background: white;
  border: 1px solid #d7e3ef;
  border-radius: 7px;
  box-shadow: 0 1px 4px rgba(23, 55, 88, 0.04);
  overflow: hidden;
  min-height: 32px;
}

.search-icon {
  flex: 0 0 auto;
  padding-left: 0.4rem;
  color: #173758;
  font-size: 0.8rem;
  line-height: 1;
}

.search-input {
  flex: 1 1 auto;
  width: 100%;
  min-width: 0;
  padding: 0.38rem 0.2rem 0.38rem 0.12rem;
  border: none;
  border-radius: 0;
  outline: none;
  font-size: 0.72rem;
  color: #173758;
  min-height: 32px;
}

.search-input:focus {
  outline: none;
}

.clear-search,
.scan-hint {
  flex: 0 0 auto;
  border: 0;
  background: transparent;
  cursor: pointer;
  line-height: 1;
  padding: 0.08rem 0.2rem;
  color: #173758;
  font-size: 0.7rem;
}

.clear-search {
  opacity: 0.65;
}

.scan-hint {
  padding-right: 0.42rem;
  color: #1677d2;
  font-size: 0.82rem;
}

.toolbar-right {
  min-width: 0;
}

.category-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 0.24rem;
  align-items: center;
  width: 100%;
  min-width: 0;
  padding: 0;
}

.category-tab {
  flex: 1 1 64px;
  min-width: 0;
  padding: 0.26rem 0.38rem;
  border: 1px solid #d9e5f0;
  background: #f8fbfe;
  color: #294766;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.62rem;
  font-weight: 700;
  min-height: 28px;
  white-space: nowrap;
}

.category-tab:hover,
.category-tab.active {
  border-color: #1677d2;
  background: #1677d2;
  color: white;
}

.catalog-meta {
  display: flex;
  justify-content: flex-end;
  width: 100%;
}

.results-info {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.28rem;
  color: #66809b;
  font-size: 0.6rem;
  white-space: nowrap;
  padding: 0.12rem 0.36rem;
  background: #f3f8fc;
  border: 1px solid #dfeaf3;
  border-radius: 6px;
  min-height: 24px;
}

@media (max-width: 700px) {
  .catalog-toolbar {
    grid-template-columns: 1fr;
  }

  .category-tabs {
    justify-content: flex-start;
  }

  .catalog-meta {
    justify-content: stretch;
  }

  .results-info {
    width: 100%;
  }
}

.cache-indicator {
  font-size: 0.8rem;
  background: #e3f2fd;
  color: #1976d2;
  padding: 0.2rem 0.5rem;
  border-radius: 4px;
  font-weight: 500;
}

.loading-dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  background: currentColor;
  border-radius: 50%;
  animation: pulse 1s infinite;
  margin-right: 0.3rem;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}

/* Grid de productos */
.catalog-sections {
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
  flex: 1;
  min-height: 0;
  min-width: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding-right: 0.08rem;
}

.unit-section {
  display: flex;
  flex-direction: column;
  gap: 0.42rem;
  border: 1px solid #dfeaf5;
  background: linear-gradient(180deg, #f9fbff 0%, #f4f9fe 100%);
  border-radius: 8px;
  padding: 0.42rem;
}

.unit-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.4rem;
  padding: 0.1rem 0.15rem 0.3rem;
  border-bottom: 1px solid rgba(22, 119, 210, 0.12);
}

.unit-section-title {
  color: #173758;
  font-size: 0.7rem;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.unit-section-count {
  padding: 0.14rem 0.42rem;
  border-radius: 999px;
  background: rgba(22, 119, 210, 0.08);
  color: #1677d2;
  font-size: 0.58rem;
  font-weight: 800;
}

.products-grid {
  flex: 1;
  min-height: 0;
  min-width: 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  align-content: start;
  gap: 0.35rem;
  padding: 0.08rem;
}

/* Producto card */
.product-card {
  background: white;
  border: 1px solid #dce7f1;
  border-radius: 7px;
  min-height: 182px;
  padding: 0.38rem;
  cursor: pointer;
  transition: all 0.3s ease;
  display: flex;
  flex-direction: column;
  gap: 0.16rem;
  position: relative;
  overflow: hidden;
  touch-action: manipulation;
}

.product-card:hover {
  border-color: #1677d2;
  box-shadow: 0 5px 14px rgba(22, 119, 210, 0.14);
  transform: translateY(-2px);
}

.product-card.is-adding {
  animation: product-added 0.45s ease;
  border-color: #22a06b;
  box-shadow: 0 0 0 3px rgba(34, 160, 107, 0.14), 0 8px 18px rgba(34, 160, 107, 0.18);
}

@keyframes product-added {
  0% { transform: scale(1); }
  45% { transform: scale(1.035); }
  100% { transform: scale(1); }
}

.product-image {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 52px;
  margin: -0.05rem -0.05rem 0.1rem;
  border-radius: 6px;
  background: #f1f6fa;
  color: #7890a8;
  font-size: 2rem;
}

.product-image img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.product-placeholder {
  display: grid;
  width: 2.8rem;
  height: 2.8rem;
  place-items: center;
  border-radius: 10px;
  background: #dcecf7;
  color: #1677d2;
  font-size: 1.7rem;
}

.product-identity {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.3rem;
  min-width: 0;
  margin-top: 0.08rem;
}

.product-code {
  overflow: hidden;
  color: #54738e;
  font-size: 0.62rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Indicador de stock */
.product-category {
  flex: 0 0 auto;
  max-width: 48%;
  overflow: hidden;
  padding: 0.16rem 0.35rem;
  border-radius: 999px;
  background: #eef6fb;
  color: #1677d2;
  font-size: 0.6rem;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.product-name {
  display: -webkit-box;
  min-height: 2.1rem;
  margin: 0.18rem 0 0.08rem;
  overflow: hidden;
  color: #173758;
  font-size: 0.74rem;
  font-weight: 750;
  line-height: 1.25;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.product-description {
  display: -webkit-box;
  min-height: 0.8rem;
  margin: 0;
  overflow: hidden;
  color: #66809b;
  font-size: 0.66rem;
  line-height: 1.3;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 1;
}

.product-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.3rem;
  margin-top: 0.2rem;
}

.stock-indicator {
  overflow: hidden;
  color: #3a936d;
  font-size: 0.65rem;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.stock-indicator.low {
  color: #d97706;
}

.stock-indicator.out {
  color: #b42318;
}

.product-unit {
  flex: 0 0 auto;
  padding: 0.12rem 0.28rem;
  border: 1px solid #d7e5f0;
  border-radius: 4px;
  color: #54738e;
  font-size: 0.56rem;
  font-weight: 800;
}

.product-price-block {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.product-price-block small {
  color: #66809b;
  font-size: 0.54rem;
  font-weight: 600;
}

.product-price-block .product-price {
  font-size: 0.8rem;
}

.product-category {
  font-size: 0.6rem;
}

.product-category:empty {
  display: none;
}

.product-description:empty {
  color: #9ab0c1;
}

/* Mantener la altura de las tarjetas aunque falten datos del catálogo. */
.product-description {
  text-overflow: ellipsis;
}

/* Footer con precio y botón */
.product-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.24rem;
  margin-top: auto;
  padding-top: 0.26rem;
  border-top: 1px solid #e0e0e0;
}

.product-price {
  font-size: 0.72rem;
  font-weight: 700;
  color: #42b983;
}

.add-btn {
  flex: 1;
  padding: 0.32rem 0.22rem;
  background: #1677d2;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.62rem;
  font-weight: 600;
  transition: all 0.2s ease;
  min-height: 30px;
}

.add-btn:hover:not(:disabled) {
  background: #764ba2;
  transform: scale(1.02);
}

.add-btn:disabled {
  background: #ccc;
  cursor: not-allowed;
  opacity: 0.6;
}

/* Loading state */
.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 3rem;
  gap: 1rem;
}

.spinner {
  width: 40px;
  height: 40px;
  border: 4px solid #e0e0e0;
  border-top-color: #667eea;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* Empty state */
.empty-state {
  grid-column: 1 / -1;
  text-align: center;
  padding: 3rem 1rem;
  color: #666;
}

.empty-state p {
  margin: 0;
  font-size: 1.1rem;
}

.empty-text {
  font-size: 0.9rem;
  opacity: 0.7;
}

/* Pagination info */
.pagination-info {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.4rem 0.55rem;
  border: 1px solid #d7e5f0;
  border-radius: 7px;
  background: #f7fbfe;
}

.pagination-count {
  color: #66809b;
  font-size: 0.7rem;
  white-space: nowrap;
}

.pagination-controls {
  display: flex;
  gap: 0.35rem;
}

.pagination-controls button {
  padding: 0.35rem 0.55rem;
  border: 1px solid #c8dbea;
  border-radius: 5px;
  background: white;
  color: #294766;
  cursor: pointer;
  font-size: 0.68rem;
  font-weight: 700;
}

.pagination-controls button:hover:not(:disabled) {
  border-color: #1677d2;
  color: #1677d2;
}

.pagination-controls button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

/* Responsive */
@media (max-width: 768px) {
  .products-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.45rem;
  }

  .product-card {
    min-height: 176px;
    padding: 0.35rem;
  }
}

@media (max-width: 480px) {
  .products-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.38rem;
  }

  .product-name {
    font-size: 0.72rem;
  }

  .add-btn {
    font-size: 0.6rem;
    padding: 0.32rem 0.2rem;
  }

  .pagination-info {
    align-items: stretch;
    flex-direction: column;
  }

  .pagination-count {
    text-align: center;
  }

  .pagination-controls {
    justify-content: center;
  }
}

@media (min-width: 1200px) {
  .products-grid {
    grid-template-columns: repeat(5, minmax(0, 1fr));
  }
}
</style>
