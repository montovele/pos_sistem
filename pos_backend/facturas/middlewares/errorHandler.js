// facturas/middlewares/errorHandler.js

export function errorHandler(
  error,
  req,
  res,
  next
) {
  console.error(error)

  return res.status(500).json({
    success: false,

    error:
      error.message ||
      'Internal Server Error',
  })
}