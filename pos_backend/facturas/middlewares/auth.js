// ======================================================
// facturas/middlewares/auth.js
// AUTH MIDDLEWARE
// ======================================================

export async function verifyToken(
  req,
  res,
  next
) {

  try {

    const token =
      req.headers.authorization

    // ==================================================
    // VALIDAR TOKEN
    // ==================================================

    if (!token) {

      return res.status(401).json({

        success: false,

        error:
          'Unauthorized',

      })

    }

    // ==================================================
    // MOCK USER
    // AQUI LUEGO VA JWT VERIFY
    // ==================================================

    req.user = {

      authorized: true,

    }

    next()

  } catch (error) {

    next(error)

  }

}

// ======================================================
// DEFAULT EXPORT
// ======================================================

export default verifyToken