/**
 * Standard JSON response helpers
 */

const success = (res, data = {}, message = 'Success', statusCode = 200) => {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
  });
};

const created = (res, data = {}, message = 'Resource created successfully') => {
  return success(res, data, message, 201);
};

const paginated = (res, { data, total, page, limit }) => {
  return res.status(200).json({
    success: true,
    count: data.length,
    total,
    page,
    pages: Math.ceil(total / limit) || 1,
    limit,
    data,
  });
};

const error = (res, message = 'Internal Server Error', statusCode = 500, code = 'INTERNAL_ERROR') => {
  return res.status(statusCode).json({
    success: false,
    error: code,
    message,
  });
};

module.exports = { success, created, paginated, error };
