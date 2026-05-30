import { createHash, randomUUID } from "crypto";
import { mkdir, writeFile, readFile, unlink } from "fs/promises";
import { join, extname } from "path";
import { getDb } from "@/server/db/client";
import { assets, assetReferences } from "@/server/db/schema/wiki";
import { eq, and } from "drizzle-orm";
import { runtime } from "@/server/config/runtime";
import { NotFoundError, ForbiddenError } from "@next-wiki/shared";
import type { PermissionContext } from "@/server/services/permissions/context";

const MIME_TO_KIND: Record<string, string> = {
  "image/png": "image",
  "image/jpeg": "image",
  "image/gif": "image",
  "image/webp": "image",
  "image/svg+xml": "image",
  "application/pdf": "document",
  "text/plain": "document",
  "application/xml": "diagram-source",
  "text/xml": "diagram-source",
};

function detectKind(mimeType: string, filename: string): string {
  if (MIME_TO_KIND[mimeType]) return MIME_TO_KIND[mimeType];
  const ext = extname(filename).toLowerCase();
  if ([".drawio", ".xml"].includes(ext)) return "diagram-source";
  if ([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"].includes(ext)) return "image";
  if ([".pdf", ".md", ".txt"].includes(ext)) return "document";
  return "other";
}

export async function uploadAsset(
  file: { buffer: Buffer; originalFilename: string; mimeType: string },
  actor: PermissionContext,
): Promise<{
  id: string;
  path: string;
  originalFilename: string;
  mimeType: string;
  byteSize: number;
  kind: string;
  url: string;
}> {
  if (!actor.userId) throw new ForbiddenError("upload asset");

  const checksum = createHash("sha256").update(file.buffer).digest("hex");
  const ext = extname(file.originalFilename) || "";
  const storagePath = join("uploads", checksum.slice(0, 2), checksum + ext);
  const fullPath = join(runtime.app.assetStoragePath, storagePath);

  await mkdir(join(runtime.app.assetStoragePath, "uploads", checksum.slice(0, 2)), {
    recursive: true,
  });
  await writeFile(fullPath, file.buffer);

  const kind = detectKind(file.mimeType, file.originalFilename);
  const db = getDb();
  const id = randomUUID();

  await db.insert(assets).values({
    id,
    storageKind: "local",
    path: storagePath,
    originalFilename: file.originalFilename,
    mimeType: file.mimeType,
    byteSize: BigInt(file.buffer.byteLength),
    checksum,
    kind,
    uploadedByUserId: actor.userId,
    createdAt: new Date(),
  });

  return {
    id,
    path: storagePath,
    originalFilename: file.originalFilename,
    mimeType: file.mimeType,
    byteSize: file.buffer.byteLength,
    kind,
    url: `/api/v1/assets/${id}/content`,
  };
}

export async function getAsset(assetId: string, _actor: PermissionContext) {
  const db = getDb();
  const rows = await db.select().from(assets).where(eq(assets.id, assetId)).limit(1);
  const asset = rows[0];
  if (!asset) throw new NotFoundError("Asset", assetId);
  return asset;
}

export async function getAssetContent(
  assetId: string,
  _actor: PermissionContext,
): Promise<{ buffer: Buffer; mimeType: string; filename: string }> {
  const asset = await getAsset(assetId, _actor);
  const fullPath = join(runtime.app.assetStoragePath, asset.path);
  const buffer = await readFile(fullPath);
  return {
    buffer,
    mimeType: asset.mimeType,
    filename: asset.originalFilename,
  };
}

export async function attachAssetToPage(
  assetId: string,
  pageId: string,
  role: "inline" | "attachment" | "diagram-source",
): Promise<void> {
  const db = getDb();
  await db
    .insert(assetReferences)
    .values({
      id: randomUUID(),
      assetId,
      ownerType: "page",
      ownerId: pageId,
      referenceRole: role,
      createdAt: new Date(),
    })
    .onConflictDoNothing();
}

export async function listPageAssets(pageId: string) {
  const db = getDb();
  const rows = await db
    .select({ asset: assets })
    .from(assetReferences)
    .innerJoin(assets, eq(assetReferences.assetId, assets.id))
    .where(and(eq(assetReferences.ownerType, "page"), eq(assetReferences.ownerId, pageId)));
  return rows.map((r) => r.asset);
}
