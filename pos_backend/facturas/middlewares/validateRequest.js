// ======================================================
// facturas/middlewares/validateRequest.js
// REQUEST VALIDATION MIDDLEWARE
// ======================================================

export function validateRequest(
  validator
) {

  return async (
    req,
    res,
    next
  ) => {

    try {

      await validator.validate(

        req.body,

        {
          abortEarly: false,
        }

      )

      next()

    } catch (error) {

      return res.status(422).json({

        success: false,

        message:
          'Validation Error',

        errors:
          error.errors || [],

      })

    }

  }

}

// ======================================================
// DEFAULT EXPORT
// ======================================================

export default validateRequest