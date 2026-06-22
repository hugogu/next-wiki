import { createHash } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import { sniffImageType, validateImage } from '@/server/content-store/image-validation';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);
const GIF87 = Buffer.from([...Buffer.from('GIF87a'), 0, 0]);
const GIF89 = Buffer.from([...Buffer.from('GIF89a'), 0, 0]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0, 0, 0, 0]), Buffer.from('WEBP'), Buffer.from([0, 0])]);
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>');

describe('sniffImageType', () => {
  it('accepts the raster allowlist by magic number', () => {
    expect(sniffImageType(PNG)).toBe('image/png');
    expect(sniffImageType(JPEG)).toBe('image/jpeg');
    expect(sniffImageType(GIF87)).toBe('image/gif');
    expect(sniffImageType(GIF89)).toBe('image/gif');
    expect(sniffImageType(WEBP)).toBe('image/webp');
  });

  it('routes SVG to the sanitizer and rejects unknown bytes', () => {
    expect(sniffImageType(SVG)).toBe('image/svg+xml');
    expect(sniffImageType(Buffer.from('<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBe('image/svg+xml');
    expect(sniffImageType(Buffer.from('not an image'))).toBeNull();
    expect(sniffImageType(Buffer.alloc(0))).toBeNull();
  });

  it('does not classify arbitrary HTML as SVG', () => {
    expect(sniffImageType(Buffer.from('<!doctype html><html><body>hi</body></html>'))).toBeNull();
    expect(sniffImageType(Buffer.from('<div><span>no svg here</span></div>'))).toBeNull();
  });

  it('ignores a misleading declared type by sniffing the bytes', () => {
    // A text payload renamed/declared as image/png is still rejected.
    expect(sniffImageType(Buffer.from('PNGish but not'))).toBeNull();
  });
});

describe('validateImage', () => {
  const max = 1024;

  it('accepts a valid in-range raster image and returns a sha256', () => {
    const result = validateImage(PNG, max);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.contentType).toBe('image/png');
      expect(result.sizeBytes).toBe(PNG.length);
      expect(result.contentHash).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it('rejects an oversize image', () => {
    const big = Buffer.concat([PNG, Buffer.alloc(max)]);
    const result = validateImage(big, max);
    expect(result).toEqual({ ok: false, reason: 'too_large' });
  });

  it('returns the unchanged raster bytes as the canonical form', () => {
    const result = validateImage(PNG, max);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.bytes.equals(PNG)).toBe(true);
  });

  it('accepts SVG, returning sanitized canonical bytes whose hash/size match', () => {
    const result = validateImage(SVG, max);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.contentType).toBe('image/svg+xml');
      expect(result.contentHash).toMatch(/^[0-9a-f]{64}$/);
      expect(result.sizeBytes).toBe(result.bytes.length);
      expect(createHash('sha256').update(result.bytes).digest('hex')).toBe(result.contentHash);
      expect(result.bytes.toString('utf8')).toContain('<svg');
    }
  });

  it('strips active content from a malicious SVG before accepting it', () => {
    const malicious = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)">' +
        '<script>alert(2)</script>' +
        '<rect width="10" height="10"/>' +
        '</svg>',
    );
    const result = validateImage(malicious, max);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const out = result.bytes.toString('utf8').toLowerCase();
      expect(out).not.toContain('<script');
      expect(out).not.toContain('onload');
      expect(out).toContain('<rect');
    }
  });

  it('rejects markup that does not sanitize to an SVG document', () => {
    // Looks SVG-routable via an XML prolog but has no usable <svg> root.
    expect(validateImage(Buffer.from('<?xml version="1.0"?><svg></svg>extra'), max).ok).toBe(true);
    expect(validateImage(Buffer.from('not an image at all'), max)).toEqual({
      ok: false,
      reason: 'unsupported_type',
    });
  });
});
