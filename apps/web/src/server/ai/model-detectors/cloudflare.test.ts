import { afterEach, describe, expect, it, vi } from 'vitest';
import { CloudflareDetector } from './cloudflare';
import { DetectorError } from './types';
import { cloudflareModel, cloudflareSchema, detectorRuntime, stubFetch } from './test-helpers';

function isSearch(url: string) {
  return url.includes('/ai/models/search');
}

async function run(detector: CloudflareDetector) {
  return detector.listModels({ abortSignal: new AbortController().signal });
}

describe('Cloudflare detector', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('maps model search task and schema evidence into normalized capabilities', async () => {
    stubFetch((url) => {
      if (isSearch(url)) {
        return {
          body: {
            success: true,
            result: [cloudflareModel('@cf/meta/llama-3.1-8b-instruct', 'Text Generation')],
          },
        };
      }
      return {
        body: cloudflareSchema(
          { prompt: { type: 'string' } },
          { response: { type: 'string' } },
        ),
      };
    });

    const result = await run(new CloudflareDetector(detectorRuntime()));
    expect(result.models).toHaveLength(1);
    const model = result.models[0]!;
    expect(model.externalId).toBe('@cf/meta/llama-3.1-8b-instruct');
    expect(model.availability).toBe('available');
    expect(model.capabilities).toContainEqual(
      expect.objectContaining({
        capability: 'text_generation',
        supported: true,
        source: 'provider',
        details: expect.objectContaining({ detector: 'cloudflare', evidence: 'catalog_and_schema' }),
      }),
    );
    expect(result.warnings).toHaveLength(0);
  });

  it('derives vision from image input schema and image_generation from image output', async () => {
    stubFetch((url) => {
      if (isSearch(url)) {
        return {
          body: {
            success: true,
            result: [
              cloudflareModel('@cf/vision/model', 'Image-to-Text'),
              cloudflareModel('@cf/text-to-image/model', 'Text-to-Image'),
            ],
          },
        };
      }
      if (url.includes('vision')) {
        return { body: cloudflareSchema({ image: { type: 'array' } }, { response: { type: 'string' } }) };
      }
      return { body: cloudflareSchema({ prompt: { type: 'string' } }, { image: { type: 'string', format: 'binary' } }) };
    });

    const result = await run(new CloudflareDetector(detectorRuntime()));
    const vision = result.models.find((m) => m.externalId.includes('vision'))!;
    const image = result.models.find((m) => m.externalId.includes('text-to-image'))!;
    expect(vision.capabilities.map((c) => c.capability)).toContain('vision');
    expect(vision.inputModalities).toContain('image');
    expect(image.capabilities.map((c) => c.capability)).toContain('image_generation');
    expect(image.outputModalities).toContain('image');
  });

  it('marks deprecated models unavailable without deleting them', async () => {
    stubFetch((url) => {
      if (isSearch(url)) {
        return {
          body: {
            success: true,
            result: [
              cloudflareModel('@cf/old/model', 'Text Generation', {
                properties: [{ property_id: 'deprecated', value: 'true' }],
              }),
            ],
          },
        };
      }
      return { body: cloudflareSchema({ prompt: {} }, { response: {} }) };
    });

    const result = await run(new CloudflareDetector(detectorRuntime({ options: { includeDeprecated: true } })));
    expect(result.models[0]!.availability).toBe('unavailable');
    expect(result.counts.unavailable).toBe(1);
  });

  it('skips experimental models when hideExperimental is on', async () => {
    stubFetch((url) => {
      if (isSearch(url)) {
        return {
          body: {
            success: true,
            result: [
              cloudflareModel('@cf/beta/model', 'Text Generation', {
                properties: [{ property_id: 'beta', value: 'true' }],
              }),
            ],
          },
        };
      }
      return { body: cloudflareSchema({ prompt: {} }, { response: {} }) };
    });

    const result = await run(new CloudflareDetector(detectorRuntime({ options: { hideExperimental: true } })));
    expect(result.models).toHaveLength(0);
    expect(result.counts.skipped).toBe(1);
  });

  it('returns a partial model with a warning when schema fetch fails', async () => {
    stubFetch((url) => {
      if (isSearch(url)) {
        return { body: { success: true, result: [cloudflareModel('@cf/meta/example', 'Text Generation')] } };
      }
      return { status: 500, body: { success: false, errors: [{ message: 'boom' }] } };
    });

    const result = await run(new CloudflareDetector(detectorRuntime()));
    expect(result.models).toHaveLength(1);
    const model = result.models[0]!;
    expect(model.partial).toBe(true);
    // Catalog evidence still classifies it despite the missing schema.
    expect(model.capabilities.map((c) => c.capability)).toContain('text_generation');
    expect(result.counts.partial).toBe(1);
    expect(result.warnings).toContainEqual({ modelExternalId: '@cf/meta/example', code: 'SCHEMA_UNAVAILABLE' });
  });

  it('fails the whole run with a safe error on a list-level failure', async () => {
    stubFetch(() => ({ status: 401, body: { success: false } }));
    await expect(run(new CloudflareDetector(detectorRuntime()))).rejects.toMatchObject({
      code: 'AUTHENTICATION_FAILED',
    });
  });

  it('fails before any network call when the account ID is missing', async () => {
    const mock = stubFetch(() => ({ body: {} }));
    await expect(run(new CloudflareDetector(detectorRuntime({ accountId: undefined })))).rejects.toBeInstanceOf(
      DetectorError,
    );
    expect(mock).not.toHaveBeenCalled();
  });

  it('fails before any network call when the API token is missing', async () => {
    const mock = stubFetch(() => ({ body: {} }));
    await expect(
      run(new CloudflareDetector(detectorRuntime({ credentials: {} }))),
    ).rejects.toMatchObject({ code: 'AUTHENTICATION_FAILED' });
    expect(mock).not.toHaveBeenCalled();
  });
});
