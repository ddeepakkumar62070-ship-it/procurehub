function successResponse(data = null, meta = {}) {
  return {
    success: true,
    data,
    ...meta,
  };
}

function errorResponse(message, code = 'INTERNAL_SERVER_ERROR', details = null) {
  return {
    success: false,
    error: {
      code,
      message,
      details,
    },
  };
}

module.exports = {
  successResponse,
  errorResponse,
};
