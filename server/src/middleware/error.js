export function notFound(req, res) {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  let { status = 500, code, message } = err;
  if (err.code === 11000) [status, code, message] = [409, 'CONFLICT', 'Already exists'];
  else if (err.name === 'CastError' || err.name === 'ValidationError') [status, code] = [400, 'VALIDATION'];
  else if (!err.expose) {
    if (status >= 500) console.error(err);
    message = status >= 500 ? 'Internal server error' : message;
  }
  res.status(status).json({ error: { code: typeof code === 'string' ? code : status >= 500 ? 'INTERNAL' : 'BAD_REQUEST', message } });
}
