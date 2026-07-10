import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { workspaceTypeViewSchema } from "@protovault/contracts";
import type { WorkspaceEnumValueView, WorkspaceFieldView, WorkspaceTypeView } from "../shared/workspace";

const INDEX_SCHEMA_VERSION = "1";

type IdentityKind = "struct" | "enum" | "field" | "enum-value";

interface IdentityRow {
  stable_id: string;
  entity_kind: IdentityKind;
  parent_id: string;
  name: string;
  qualified_name: string;
  ordinal: number;
  signature: string;
}

function parseTypes(value: string): WorkspaceTypeView[] | undefined {
  try {
    const parsed = workspaceTypeViewSchema.array().safeParse(JSON.parse(value));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

function typeSignature(type: WorkspaceTypeView): string {
  return type.kind === "struct"
    ? JSON.stringify({ kind: type.kind, fields: type.fields.map((field) => [field.type, field.initializer ?? ""]) })
    : JSON.stringify({ kind: type.kind, underlyingType: type.underlyingType ?? "", values: type.values.map((value) => value.value ?? null) });
}

function fieldSignature(field: WorkspaceFieldView): string {
  return JSON.stringify([field.type, field.initializer ?? ""]);
}

function enumValueSignature(value: WorkspaceEnumValueView): string {
  return JSON.stringify([value.value ?? null]);
}

function chooseIdentity<T>(
  item: T,
  ordinal: number,
  rows: IdentityRow[],
  usedIds: Set<string>,
  exactName: (value: T) => string,
  signature: (value: T) => string
): IdentityRow | undefined {
  const exact = rows.find((row) => !usedIds.has(row.stable_id) && row.name === exactName(item));
  if (exact) return exact;
  const itemSignature = signature(item);
  const candidates = rows.filter((row) => !usedIds.has(row.stable_id) && row.signature === itemSignature);
  if (candidates.length === 1) return candidates[0];
  return rows.find((row) => !usedIds.has(row.stable_id) && row.ordinal === ordinal);
}

export class WorkspaceIndex {
  private constructor(private readonly database: DatabaseSync, readonly path: string) {}

  static async open(workspaceRoot: string): Promise<WorkspaceIndex> {
    const cacheRoot = join(workspaceRoot, ".protocol", "cache");
    await fs.mkdir(cacheRoot, { recursive: true });
    await fs.writeFile(join(cacheRoot, ".gitignore"), "*\n!.gitignore\n", { encoding: "utf8", flag: "wx" }).catch((error) => {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    });
    const indexPath = join(cacheRoot, "workspace-index.sqlite");
    const database = new DatabaseSync(indexPath);
    database.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      PRAGMA busy_timeout = 3000;
      CREATE TABLE IF NOT EXISTS index_metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS header_cache (
        path TEXT PRIMARY KEY,
        content_hash TEXT NOT NULL,
        dependency_fingerprint TEXT NOT NULL,
        types_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS protocol_identity (
        stable_id TEXT PRIMARY KEY,
        entity_kind TEXT NOT NULL,
        file_path TEXT NOT NULL,
        parent_id TEXT NOT NULL DEFAULT '',
        name TEXT NOT NULL,
        qualified_name TEXT NOT NULL DEFAULT '',
        ordinal INTEGER NOT NULL,
        signature TEXT NOT NULL,
        active INTEGER NOT NULL DEFAULT 1,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS identity_file_kind_idx
        ON protocol_identity(file_path, entity_kind, parent_id, active);
    `);
    database.prepare(`
      INSERT INTO index_metadata(key, value) VALUES ('schema_version', ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(INDEX_SCHEMA_VERSION);
    return new WorkspaceIndex(database, indexPath);
  }

  close(): void {
    this.database.close();
  }

  stats(): { cachedHeaderCount: number; activeIdentityCount: number } {
    const cache = this.database.prepare("SELECT COUNT(*) AS count FROM header_cache").get() as { count: number };
    const identities = this.database.prepare("SELECT COUNT(*) AS count FROM protocol_identity WHERE active = 1").get() as { count: number };
    return { cachedHeaderCount: Number(cache.count), activeIdentityCount: Number(identities.count) };
  }

  getHeaderTypes(path: string, dependencyFingerprint: string): WorkspaceTypeView[] | undefined {
    const row = this.database.prepare(`
      SELECT types_json FROM header_cache WHERE path = ? AND dependency_fingerprint = ?
    `).get(path, dependencyFingerprint) as { types_json?: string } | undefined;
    return row?.types_json ? parseTypes(row.types_json) : undefined;
  }

  getLastValidHeaderTypes(path: string): WorkspaceTypeView[] | undefined {
    const row = this.database.prepare(`SELECT types_json FROM header_cache WHERE path = ?`).get(path) as { types_json?: string } | undefined;
    return row?.types_json ? parseTypes(row.types_json) : undefined;
  }

  putHeaderTypes(path: string, contentHash: string, dependencyFingerprint: string, types: WorkspaceTypeView[]): void {
    this.database.prepare(`
      INSERT INTO header_cache(path, content_hash, dependency_fingerprint, types_json, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(path) DO UPDATE SET
        content_hash = excluded.content_hash,
        dependency_fingerprint = excluded.dependency_fingerprint,
        types_json = excluded.types_json,
        updated_at = excluded.updated_at
    `).run(path, contentHash, dependencyFingerprint, JSON.stringify(types), new Date().toISOString());
  }

  deleteMissingHeaders(activePaths: string[]): void {
    if (activePaths.length === 0) {
      this.database.exec("DELETE FROM header_cache; UPDATE protocol_identity SET active = 0;");
      return;
    }
    const placeholders = activePaths.map(() => "?").join(",");
    this.database.prepare(`DELETE FROM header_cache WHERE path NOT IN (${placeholders})`).run(...activePaths);
    this.database.prepare(`UPDATE protocol_identity SET active = 0 WHERE file_path NOT IN (${placeholders})`).run(...activePaths);
  }

  moveHeaderPath(oldPath: string, newPath: string): void {
    const now = new Date().toISOString();
    this.database.prepare(`UPDATE header_cache SET path = ?, updated_at = ? WHERE path = ?`).run(newPath, now, oldPath);
    this.database.prepare(`UPDATE protocol_identity SET file_path = ?, updated_at = ? WHERE file_path = ?`).run(newPath, now, oldPath);
  }

  reconcileHeaderIdentities(filePath: string, types: WorkspaceTypeView[]): WorkspaceTypeView[] {
    const previousRows = this.database.prepare(`
      SELECT stable_id, entity_kind, parent_id, name, qualified_name, ordinal, signature
      FROM protocol_identity WHERE file_path = ? AND active = 1
      ORDER BY ordinal
    `).all(filePath) as unknown as IdentityRow[];
    const previousTypes = previousRows.filter((row) => (row.entity_kind === "struct" || row.entity_kind === "enum") && row.parent_id === "");
    const usedTypeIds = new Set<string>();

    const reconciled = types.map((type, typeIndex): WorkspaceTypeView => {
      const matched = previousTypes.find((row) => !usedTypeIds.has(row.stable_id) && row.qualified_name === type.qualifiedName)
        ?? chooseIdentity(type, typeIndex, previousTypes.filter((row) => row.entity_kind === type.kind), usedTypeIds, (value) => value.name, typeSignature);
      const stableTypeId = matched?.stable_id ?? type.id ?? randomUUID();
      usedTypeIds.add(stableTypeId);

      const previousMembers = previousRows.filter((row) => row.parent_id === stableTypeId);
      const usedMemberIds = new Set<string>();
      const fields = type.fields.map((field, fieldIndex): WorkspaceFieldView => {
        const row = chooseIdentity(field, fieldIndex, previousMembers.filter((item) => item.entity_kind === "field"), usedMemberIds, (value) => value.name, fieldSignature);
        const stableId = row?.stable_id ?? field.id ?? randomUUID();
        usedMemberIds.add(stableId);
        return { ...field, id: stableId };
      });
      const values = type.values.map((value, valueIndex): WorkspaceEnumValueView => {
        const row = chooseIdentity(value, valueIndex, previousMembers.filter((item) => item.entity_kind === "enum-value"), usedMemberIds, (item) => item.name, enumValueSignature);
        const stableId = row?.stable_id ?? value.id ?? randomUUID();
        usedMemberIds.add(stableId);
        return { ...value, id: stableId };
      });
      return { ...type, id: stableTypeId, fields, values };
    });

    const now = new Date().toISOString();
    this.database.exec("BEGIN IMMEDIATE");
    try {
      this.database.prepare(`UPDATE protocol_identity SET active = 0, updated_at = ? WHERE file_path = ?`).run(now, filePath);
      const upsert = this.database.prepare(`
        INSERT INTO protocol_identity(stable_id, entity_kind, file_path, parent_id, name, qualified_name, ordinal, signature, active, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
        ON CONFLICT(stable_id) DO UPDATE SET
          entity_kind = excluded.entity_kind,
          file_path = excluded.file_path,
          parent_id = excluded.parent_id,
          name = excluded.name,
          qualified_name = excluded.qualified_name,
          ordinal = excluded.ordinal,
          signature = excluded.signature,
          active = 1,
          updated_at = excluded.updated_at
      `);
      for (const [typeIndex, type] of reconciled.entries()) {
        upsert.run(type.id, type.kind, filePath, "", type.name, type.qualifiedName, typeIndex, typeSignature(type), now);
        for (const [fieldIndex, field] of type.fields.entries()) {
          upsert.run(field.id, "field", filePath, type.id, field.name, "", fieldIndex, fieldSignature(field), now);
        }
        for (const [valueIndex, value] of type.values.entries()) {
          upsert.run(value.id, "enum-value", filePath, type.id, value.name, "", valueIndex, enumValueSignature(value), now);
        }
      }
      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
    return reconciled;
  }
}
