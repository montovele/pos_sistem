export const jsonSuccess = (data, extra = {}) => ({
  success: true,
  data,
  ...extra
});

export const jsonError = (message, status = 400) => ({
  success: false,
  message,
  status
});
