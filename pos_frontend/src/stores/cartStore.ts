import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Cart, CartItem, Product } from '@/types'
import { getProductPrice, getProductUnit, isWeightedProduct } from '@/utils/helpers'

export const useCartStore = defineStore('cart', () => {
  const items = ref<CartItem[]>([])

  const itemCount = computed(() => items.value.reduce((sum, item) => sum + item.quantity, 0))

  const subtotal = computed(() => {
    return items.value.reduce((sum, item) => sum + Number(item.priceTot ?? getProductPrice(item.product) * item.quantity), 0)
  })

  const tax = computed(() => {
    return subtotal.value * 0.16 // 16% IVA
  })

  const total = computed(() => subtotal.value + tax.value)

  const cart = computed<Cart>(() => ({
    items: items.value,
    total: total.value,
    subtotal: subtotal.value,
    tax: tax.value,
    itemCount: itemCount.value
  }))

  const addItem = (product: Product, quantity: number): boolean => {
    const productPrice = getProductPrice(product)
    const legacyProduct = product as Product & { unidad?: string }
    const explicitWeightUnit = ['KG', 'G', 'GR', 'GRAMOS'].includes(String(legacyProduct?.unit ?? legacyProduct?.unidad ?? '').trim().toUpperCase())
    const isWeightSale = isWeightedProduct(product) || explicitWeightUnit
    const normalizedQuantity = isWeightSale
      ? Number(Number(quantity).toFixed(3))
      : Math.trunc(Number(quantity))

    if (!Number.isFinite(normalizedQuantity) || normalizedQuantity <= 0) return false

    const normalizedProduct = {
      ...product,
      unit: getProductUnit(product),
      saleByWeight: isWeightSale,
      price: productPrice,
      discountRate: Number(product.discountRate ?? 0),
      taxRate: Number(product.taxRate ?? 0.16)
    }

    const existingItem = items.value.find(item => item.product.id === product.id)

    if (existingItem) {
      const nextQuantity = isWeightSale
        ? Number((existingItem.quantity + normalizedQuantity).toFixed(3))
        : existingItem.quantity + normalizedQuantity
      const nextTotal = productPrice * nextQuantity

      items.value = items.value.map(item => {
        if (item.product.id !== product.id) return item
        return {
          ...item,
          product: normalizedProduct,
          quantity: nextQuantity,
          unit: getProductUnit(product),
          priceTot: nextTotal,
          discountRate: normalizedProduct.discountRate,
          price: normalizedProduct.price,
          codigoProd: normalizedProduct.codigoProd,
          nombreProd: normalizedProduct.nombreProd,
          productId: normalizedProduct.id
        }
      })
      return true
    }

    const cartItem: CartItem = {
      id: `${product.id}-${Date.now()}`,
      product: normalizedProduct,
      productId: product.id,
      codigoProd: product.codigoProd,
      nombreProd: product.nombreProd,
      quantity: normalizedQuantity,
      unit: getProductUnit(product),
      price: productPrice,
      discountRate: Number(product.discountRate ?? 0),
      priceTot: productPrice * normalizedQuantity,
      fechaDeTrans: new Date().toISOString(),
      codigoTransaccion: `TRX-${Date.now()}`,
      codigoTicket: `TKT-${Math.random().toString(36).substring(2, 9).toUpperCase()}`
    }

    items.value = [...items.value, cartItem]
    return true
  }

  const removeItem = (itemId: string) => {
    items.value = items.value.filter(item => item.id !== itemId)
  }

  const updateItemQuantity = (itemId: string, quantity: number) => {
    const item = items.value.find(i => i.id === itemId)
    if (!item) return

    if (!Number.isFinite(quantity) || quantity <= 0) {
      removeItem(itemId)
      return
    }

    const normalizedQuantity = Number(quantity.toFixed(3))

    items.value = items.value.map(current => {
      if (current.id !== itemId) return current
      return {
        ...current,
        quantity: normalizedQuantity,
        priceTot: getProductPrice(current.product) * normalizedQuantity
      }
    })
  }

  const clear = () => {
    items.value = []
  }

  const getItem = (itemId: string) => {
    return items.value.find(item => item.id === itemId)
  }

  return {
    items,
    itemCount,
    subtotal,
    tax,
    total,
    cart,
    addItem,
    removeItem,
    updateItemQuantity,
    clear,
    getItem
  }
})
