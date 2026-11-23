export function localReturnPath(value) {
  if (typeof value !== 'string' || !/^\/(?!\/)/.test(value) || /[\\\u0000-\u0020\u007f]/u.test(value)) return null;
  const base = 'https://deanery.invalid';
  const url = new URL(value, base);
  return url.origin === base && !url.pathname.startsWith('//') ? url.pathname + url.search + url.hash : null;
}
