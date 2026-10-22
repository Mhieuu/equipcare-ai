/**
 * Require hook cho `pnpm dev` (node --watch -r ts-node/register).
 *
 * Vấn đề: source dùng import kèm đuôi `.js` (vd `import { AppModule } from
 * './app.module.js'`) — đúng chuẩn ESM, và `tsc` build ra `dist/*.js` nên chạy
 * production OK. Nhưng khi chạy trực tiếp file `.ts` qua ts-node, Node resolve
 * `./app.module.js` thất bại vì file đó không tồn tại (chỉ có `app.module.ts`).
 *
 * Jest đã xử lý bằng `moduleNameMapper` trong jest.config.cjs. File này là
 * bản CJS tương đương cho Node runtime.
 *
 * Ghi chú: hook này chỉ dùng cho dev/tsx-free watch mode. Production build
 * (`pnpm build` + `node dist/main.js`) không cần và không bị ảnh hưởng.
 */
const Module = require('node:module');

const originalResolveFilename = Module._resolveFilename;

/** @type {(request: string) => boolean} */
function isRelativeJsSpecifier(request) {
  return (
    typeof request === 'string' &&
    (request.startsWith('./') || request.startsWith('../')) &&
    request.endsWith('.js')
  );
}

Module._resolveFilename = function resolveFilename(request, ...rest) {
  try {
    return originalResolveFilename.call(this, request, ...rest);
  } catch (err) {
    if (isRelativeJsSpecifier(request)) {
      return originalResolveFilename.call(this, `${request.slice(0, -3)}.ts`, ...rest);
    }
    throw err;
  }
};