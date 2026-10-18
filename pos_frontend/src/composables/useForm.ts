import { ref, reactive } from 'vue'

export const useForm = <T extends Record<string, any>>(initialValues: T) => {
  const values = reactive<Record<string, any>>({ ...initialValues })
  const errors = reactive<Record<string, string>>({})
  const touched = reactive<Record<string, boolean>>({})
  const isSubmitting = ref(false)

  const setFieldValue = (field: keyof T | string, value: any) => {
    ;(values as Record<string, any>)[field as string] = value
  }

  const setFieldError = (field: string, error: string) => {
    errors[field] = error
  }

  const setFieldTouched = (field: string, touchedValue = true) => {
    touched[field] = touchedValue
  }

  const reset = () => {
    Object.assign(values, initialValues)
    Object.keys(errors).forEach(key => delete errors[key])
    Object.keys(touched).forEach(key => delete touched[key])
  }

  const validate = (validator: (values: Record<string, any>) => Record<string, string>) => {
    const newErrors = validator(values as Record<string, any>)
    Object.keys(errors).forEach(key => delete errors[key])
    Object.assign(errors, newErrors)
    return Object.keys(newErrors).length === 0
  }

  return {
    values,
    errors,
    touched,
    isSubmitting,
    setFieldValue,
    setFieldError,
    setFieldTouched,
    reset,
    validate
  }
}

export const useAsync = <T, E = Error>(asyncFunction: () => Promise<T>) => {
  const data = ref<T | null>(null)
  const error = ref<E | null>(null)
  const isLoading = ref(false)

  const execute = async () => {
    isLoading.value = true
    error.value = null
    try {
      data.value = await asyncFunction()
    } catch (err) {
      error.value = err as E
    } finally {
      isLoading.value = false
    }
  }

  return {
    data,
    error,
    isLoading,
    execute
  }
}

export const useDebounce = <T extends (...args: any[]) => any>(
  fn: T,
  delay: number
) => {
  let timeoutId: ReturnType<typeof setTimeout>

  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId)
    timeoutId = setTimeout(() => fn(...args), delay)
  }
}

export const usePagination = (items: any[], pageSize: number) => {
  const currentPage = ref(1)

  const paginatedItems = ref(
    items.slice(0, pageSize)
  )

  const totalPages = Math.ceil(items.length / pageSize)

  const goToPage = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      currentPage.value = page
      const start = (page - 1) * pageSize
      paginatedItems.value = items.slice(start, start + pageSize)
    }
  }

  const nextPage = () => goToPage(currentPage.value + 1)
  const prevPage = () => goToPage(currentPage.value - 1)

  return {
    currentPage,
    paginatedItems,
    totalPages,
    goToPage,
    nextPage,
    prevPage
  }
}
