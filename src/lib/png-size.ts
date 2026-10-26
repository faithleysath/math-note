/**
 * 只读 PNG 的 IHDR 头拿像素尺寸，不解码整张图。
 *
 * 裁图流水线（scripts/crop-figures.ts）与尺寸回填脚本（scripts/backfill-asset-size.ts）
 * 都用这一个实现，避免两处各写一套字节偏移。
 */

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;

export interface PngSize {
  width: number;
  height: number;
}

/** 读不出合法 IHDR 时返回 null（文件损坏 / 不是 PNG / 尺寸为 0） */
export function readPngSize(buffer: Uint8Array): PngSize | null {
  // 8 字节签名 + 4 字节长度 + 4 字节类型 + 4+4 字节宽高
  if (buffer.length < 24) return null;
  for (let index = 0; index < PNG_SIGNATURE.length; index += 1) {
    if (buffer[index] !== PNG_SIGNATURE[index]) return null;
  }
  const chunkType = String.fromCharCode(buffer[12], buffer[13], buffer[14], buffer[15]);
  if (chunkType !== 'IHDR') return null;
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  if (width < 1 || height < 1) return null;
  return { width, height };
}
