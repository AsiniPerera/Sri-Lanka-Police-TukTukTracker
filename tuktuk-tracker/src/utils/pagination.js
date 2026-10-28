/**
 * Parse pagination params from query string.
 * Defaults: page=1, limit=25, max limit=200.
 */
const getPagination = (query) => {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(200, Math.max(1, parseInt(query.limit, 10) || 25));
  const skip = (page - 1) * limit;
  return { page, limit, skip };
};

/**
 * Build a sort object from a `sort` query string like "createdAt:desc,name:asc".
 * Defaults to `{ createdAt: -1 }`.
 */
const getSort = (sortStr, defaultSort = { createdAt: -1 }) => {
  if (!sortStr) return defaultSort;
  const sort = {};
  sortStr.split(',').forEach((pair) => {
    const [field, dir] = pair.split(':');
    if (field) sort[field.trim()] = dir && dir.toLowerCase() === 'asc' ? 1 : -1;
  });
  return Object.keys(sort).length ? sort : defaultSort;
};

module.exports = { getPagination, getSort };
