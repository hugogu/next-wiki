import { z } from 'zod';
import * as docSchemas from './openapi-schemas';
import * as sharedSchemas from '@next-wiki/shared';

/**
 * Guards against `openapi-schemas.ts` silently drifting from the runtime
 * validators in `@next-wiki/shared`. The two are maintained by hand — one
 * feeds next-openapi-gen (docs), the other validates requests at runtime —
 * and nothing else keeps them in sync. See specs/010-ai-curation-api for the
 * investigation that motivated this.
 */

type AnyZod = z.ZodTypeAny;

const Kind = z.ZodFirstPartyTypeKind;

function unwrap(schema: AnyZod): AnyZod {
  let current = schema;
  for (;;) {
    const def = current._def as {
      typeName?: string;
      schema?: AnyZod;
      innerType?: AnyZod;
      getter?: () => AnyZod;
      in?: AnyZod;
    };
    if (def.typeName === Kind.ZodEffects && def.schema) {
      current = def.schema;
    } else if (
      (def.typeName === Kind.ZodOptional || def.typeName === Kind.ZodDefault || def.typeName === Kind.ZodNullable) &&
      def.innerType
    ) {
      current = def.innerType;
    } else if (def.typeName === Kind.ZodLazy && def.getter) {
      current = def.getter();
    } else if (def.typeName === Kind.ZodPipeline && def.in) {
      // Compare the input side, not the post-`.transform()`/`.pipe()` output shape:
      // API callers (query params, request bodies) are bound by what they can send in,
      // not by what a handler converts it to internally.
      current = def.in;
    } else {
      return current;
    }
  }
}

/** Whether a field accepts being omitted entirely — the same question the
 * `required` array in the generated OpenAPI schema is meant to answer. Using
 * Zod's own parse behavior (rather than checking for `.optional()` syntactically)
 * means `.default(x)` and `.optional().default(x)` are correctly treated as
 * equivalent, even though they render differently through next-openapi-gen. */
function acceptsOmission(schema: AnyZod): boolean {
  return schema.safeParse(undefined).success;
}

function typeTag(schema: AnyZod): string {
  const base = unwrap(schema);
  const def = base._def as { typeName: string; values?: readonly string[]; value?: unknown };
  if (def.typeName === Kind.ZodEnum) {
    return `enum(${[...(def.values ?? [])].sort().join('|')})`;
  }
  if (def.typeName === Kind.ZodLiteral) {
    return `literal(${JSON.stringify(def.value)})`;
  }
  return def.typeName;
}

function shapeOf(schema: AnyZod): Record<string, AnyZod> | null {
  const base = unwrap(schema);
  return base instanceof z.ZodObject ? (base._def.shape() as Record<string, AnyZod>) : null;
}

function deriveRuntimeName(pascalName: string): string {
  return `${pascalName[0]!.toLowerCase()}${pascalName.slice(1)}Schema`;
}

interface Pair {
  name: string;
  runtimeName: string;
  doc: AnyZod;
  runtime: AnyZod;
}

/**
 * Auto-discovers doc/runtime pairs by the `Foo` <-> `fooSchema` naming
 * convention already used throughout openapi-schemas.ts — the same
 * convention next-openapi-gen itself falls back to when resolving a schema
 * by type name. Pairs that are the exact same object (plain re-exports like
 * `StorageOverview = storageOverviewSchema`) are skipped: there is no drift
 * risk when both names point at one shared instance.
 */
function discoverPairs(): Pair[] {
  const pairs: Pair[] = [];
  for (const [name, value] of Object.entries(docSchemas)) {
    if (!/^[A-Z]/.test(name) || !(value instanceof z.ZodType)) continue;
    const runtimeName = deriveRuntimeName(name);
    const runtimeValue = (sharedSchemas as Record<string, unknown>)[runtimeName];
    if (!(runtimeValue instanceof z.ZodType) || (runtimeValue as AnyZod) === value) continue;
    pairs.push({ name, runtimeName, doc: value, runtime: runtimeValue as AnyZod });
  }
  return pairs;
}

interface FieldCheck {
  path: string;
  doc: AnyZod;
  runtime: AnyZod;
}

/** Compares nested object fields one extra level deep (e.g. PublicPageResource.links)
 * without building a fully general recursive schema differ — this codebase's shared
 * schemas don't nest deeper than that today. */
function collectFieldChecks(basePath: string, doc: AnyZod, runtime: AnyZod, depth: number): FieldCheck[] {
  const docShape = shapeOf(doc);
  const runtimeShape = shapeOf(runtime);
  if (!docShape || !runtimeShape) return [];

  const checks: FieldCheck[] = [];
  for (const key of new Set([...Object.keys(docShape), ...Object.keys(runtimeShape)])) {
    const path = basePath ? `${basePath}.${key}` : key;
    const docField = docShape[key];
    const runtimeField = runtimeShape[key];
    if (!docField || !runtimeField) {
      checks.push({ path, doc: docField ?? z.never(), runtime: runtimeField ?? z.never() });
      continue;
    }
    checks.push({ path, doc: docField, runtime: runtimeField });
    if (depth > 0 && typeTag(docField) === Kind.ZodObject && typeTag(runtimeField) === Kind.ZodObject) {
      checks.push(...collectFieldChecks(path, unwrap(docField), unwrap(runtimeField), depth - 1));
    }
  }
  return checks;
}

const pairs = discoverPairs();

describe('openapi-schemas.ts stays structurally in sync with @next-wiki/shared', () => {
  it('discovers the known page schema pairs (guards against the discovery mechanism itself silently finding nothing)', () => {
    expect(pairs.map((p) => p.name)).toEqual(
      expect.arrayContaining(['PublicPageCreateInput', 'PublicPageResource', 'PublicDraftCreateInput', 'PublicAuthor']),
    );
  });

  describe.each(pairs.map((p) => [p.name, p] as const))('%s <-> runtime schema', (_name, pair) => {
    const docShape = shapeOf(pair.doc);
    const runtimeShape = shapeOf(pair.runtime);

    it('is a Zod object on both sides, or matches on coarse type when not', () => {
      if (!docShape || !runtimeShape) {
        expect(typeTag(pair.doc)).toBe(typeTag(pair.runtime));
      } else {
        expect(true).toBe(true);
      }
    });

    if (docShape && runtimeShape) {
      const fieldChecks = collectFieldChecks('', pair.doc, pair.runtime, 1);

      it('has the same field names as the runtime schema', () => {
        expect(Object.keys(docShape).sort()).toEqual(Object.keys(runtimeShape).sort());
      });

      it.each(fieldChecks.map((c) => [c.path, c] as const))('field "%s" is required/optional consistently', (_path, check) => {
        expect(acceptsOmission(check.doc)).toBe(acceptsOmission(check.runtime));
      });

      it.each(fieldChecks.map((c) => [c.path, c] as const))('field "%s" has a matching base type', (_path, check) => {
        expect(typeTag(check.doc)).toBe(typeTag(check.runtime));
      });
    }
  });
});
