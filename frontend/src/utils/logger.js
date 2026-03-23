const isProduction = process.env.NODE_ENV === 'production';

function _emit(level, ...args) {
  if (isProduction && level === 'info') {
    return;
  }
  const target = console[level] || console.log;
  target(...args);
}

const logger = {
  info: (...args) => _emit('info', ...args),
  warn: (...args) => _emit('warn', ...args),
  error: (...args) => _emit('error', ...args),
};

export default logger;
