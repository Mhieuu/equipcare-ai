import { promises as fs, createReadStream, type ReadStream } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

/**
 * StorageAdapter — interface trừu tượng cho blob storage.
 *
 * M3 dùng LocalFsAdapter (dev/test); P1 production có thể thay bằng
 * S3Adapter (MinIO / AWS S3) mà KHÔNG đổi service layer.
 *
 * Quy ước `objectKey`:
 *  - File riêng lẻ: `yyyy/mm/{uuid}.{ext}` (service tự gen).
 *  - Version document: `documents/{docId}/v{versionNo}-{shaShort}.{ext}`.
 *
 * Lưu ý: `objectKey` KHÔNG được phép chứa `..` (path traversal) — service
 * phải gọi `assertSafeKey()` trước khi dùng.
 */
export interface StorageAdapter {
  /** Tên adapter (cho log/audit). */
  readonly name: string;

  /** Upload 1 object, ghi đè nếu đã tồn tại. Trả về byte size đã ghi. */
  put(objectKey: string, data: Buffer | Uint8Array): Promise<number>;

  /** Đọc 1 object về Buffer. Throw nếu không tồn tại. */
  get(objectKey: string): Promise<Buffer>;

  /** Stream object — dùng cho download endpoint (tiết kiệm RAM cho file lớn). */
  getStream(objectKey: string): ReadStream;

  /** Xóa 1 object. Không lỗi nếu không tồn tại. */
  remove(objectKey: string): Promise<void>;

  /** Check object có tồn tại. */
  exists(objectKey: string): Promise<boolean>;
}

/**
 * Validate `objectKey` chống path traversal.
 *
 * - Không chứa `..` segment.
 * - Không bắt đầu bằng `/` (tuyệt đối).
 * - Không chứa null byte.
 *
 * Throw AppError nếu không hợp lệ.
 */
export function assertSafeKey(key: string): void {
  if (!key || typeof key !== 'string') {
    throw new Error(`Invalid object key: ${String(key)}`);
  }
  if (key.includes('\0')) {
    throw new Error(`Invalid object key (null byte): ${key}`);
  }
  if (key.startsWith('/')) {
    throw new Error(`Invalid object key (absolute): ${key}`);
  }
  const segments = key.split('/');
  if (segments.some((s) => s === '..' || s === '.')) {
    throw new Error(`Invalid object key (traversal): ${key}`);
  }
}

/**
 * LocalFsAdapter — ghi file trên local FS.
 *
 * Mặc định ghi vào `{cwd}/var/storage/`. Có thể override qua env `LOCAL_STORAGE_DIR`.
 *
 * Path joining dùng `path.join` an toàn kết hợp `assertSafeKey()` ở service
 * layer — double-check qua `resolve` để chặn nếu `objectKey` lọt qua có `..`
 * sau khi normalize.
 */
export class LocalFsAdapter implements StorageAdapter {
  readonly name = 'local-fs';
  private readonly rootDir: string;

  constructor(rootDir?: string) {
    const envDir = process.env.LOCAL_STORAGE_DIR;
    this.rootDir = rootDir ?? envDir ?? resolve(process.cwd(), 'var/storage');
  }

  async put(objectKey: string, data: Buffer | Uint8Array): Promise<number> {
    const target = this.fullPath(objectKey);
    await fs.mkdir(dirname(target), { recursive: true });
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
    await fs.writeFile(target, buf);
    return buf.length;
  }

  async get(objectKey: string): Promise<Buffer> {
    return fs.readFile(this.fullPath(objectKey));
  }

  getStream(objectKey: string): ReadStream {
    return createReadStream(this.fullPath(objectKey));
  }

  async remove(objectKey: string): Promise<void> {
    try {
      await fs.unlink(this.fullPath(objectKey));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
  }

  async exists(objectKey: string): Promise<boolean> {
    try {
      await fs.access(this.fullPath(objectKey));
      return true;
    } catch {
      return false;
    }
  }

  /** Trả về absolute path, double-check chống escape khỏi root. */
  private fullPath(objectKey: string): string {
    assertSafeKey(objectKey);
    const full = join(this.rootDir, objectKey);
    // Normalize cả root và full về dạng POSIX (chuyển '\\' → '/') trước khi so sánh.
    // Lý do: trên Windows, `join('C:\\a', 'b/c')` cho 'C:\\a\\b\\c' (backslash),
    // trong khi objectKey là POSIX → string comparison sẽ sai.
    const normalize = (p: string): string => p.replace(/\\/g, '/').replace(/\/+$/, '');
    const rootNorm = normalize(resolve(this.rootDir));
    const fullNorm = normalize(resolve(full));
    if (fullNorm !== rootNorm && !fullNorm.startsWith(rootNorm + '/')) {
      throw new Error(`Storage path escapes root: ${fullNorm}`);
    }
    return full;
  }
}

/**
 * Gen objectKey theo convention `yyyy/mm/{uuid}.{ext}`.
 */
export function genObjectKey(ext: string): string {
  const now = new Date();
  const yyyy = now.getUTCFullYear().toString();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const uuid = crypto.randomUUID();
  const safeExt = ext.replace(/[^A-Za-z0-9]/g, '').toLowerCase();
  return `${yyyy}/${mm}/${uuid}${safeExt ? `.${safeExt}` : ''}`;
}
