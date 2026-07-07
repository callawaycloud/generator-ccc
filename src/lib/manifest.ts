import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import merge from "deepmerge";
import { parseStringPromise as parseXml } from "xml2js";

export interface PackageXml {
  version?: string;
  namespace?: string;
  types?: Record<string, string[]>;
}

interface XmlPackageType {
  name: string[];
  members: string[];
}

interface ParsedPackageXml {
  Package?: {
    version?: string[];
    $?: { xmlns?: string };
    types?: XmlPackageType[];
  };
}

/**
 * Parses a package.xml string into a PackageXml object.
 */
export async function readPackage(xmlStr: string): Promise<PackageXml> {
  const xml = (await parseXml(xmlStr)) as ParsedPackageXml;
  const version = xml.Package?.version?.[0];
  const namespace = xml.Package?.$?.xmlns;
  let types: PackageXml["types"] = {};

  if (xml.Package?.types) {
    try {
      types = xml.Package.types.reduce<Record<string, string[]>>((res, t) => {
        res[t.name[0]] = t.members;
        return res;
      }, {});
    } catch (error) {
      console.error(error);
    }
  }

  return {
    version,
    namespace,
    types,
  };
}

/**
 * Serializes a PackageXml object back to package.xml format.
 */
export function writePackage(pkg: PackageXml): string {
  let types = "";
  if (pkg.types) {
    for (const key in pkg.types) {
      types += "  <types>\n";
      types +=
        [...new Set<string>(pkg.types[key])].map((m) => `    <members>${m}</members>`).join("\n") +
        "\n";
      types += `    <name>${key}</name>\n`;
      types += "  </types>\n";
    }
  }

  return `<?xml version="1.0" encoding="UTF-8" ?>
<Package xmlns="${pkg.namespace ?? ""}">
${types}  <version>${pkg.version ?? ""}</version>
</Package>
`;
}

export type ManifestMergeResult = "created" | "merged" | "skipped";

/**
 * Ensures the parent directory for a file path exists.
 */
function ensureParentDir(filePath: string): void {
  const parentDir = path.dirname(filePath);
  if (!existsSync(parentDir)) {
    mkdirSync(parentDir, { recursive: true });
  }
}

/**
 * Merges a default package.xml with an existing manifest; existing values win.
 * Writes only when the result differs from the file on disk.
 */
export async function mergeManifestFile(
  manifestPath: string,
  defaultXmlContent: string
): Promise<ManifestMergeResult> {
  const fileExists = existsSync(manifestPath);
  const oldPkgManifest: PackageXml | null = fileExists
    ? await readPackage(readFileSync(manifestPath, "utf-8"))
    : null;

  const defaultPkg = await readPackage(defaultXmlContent);
  const newPkgXml = oldPkgManifest ? merge(defaultPkg, oldPkgManifest) : defaultPkg;
  const newContent = writePackage(newPkgXml);

  if (fileExists) {
    const existingContent = readFileSync(manifestPath, "utf-8");
    if (existingContent === newContent) {
      return "skipped";
    }
    ensureParentDir(manifestPath);
    writeFileSync(manifestPath, newContent, "utf-8");
    return "merged";
  }

  ensureParentDir(manifestPath);
  writeFileSync(manifestPath, newContent, "utf-8");
  return "created";
}

/**
 * Returns the merged manifest content without writing; null when no change would occur.
 */
export async function previewManifestMerge(
  manifestPath: string,
  defaultXmlContent: string
): Promise<string | null> {
  const fileExists = existsSync(manifestPath);
  const oldPkgManifest: PackageXml | null = fileExists
    ? await readPackage(readFileSync(manifestPath, "utf-8"))
    : null;

  const defaultPkg = await readPackage(defaultXmlContent);
  const newPkgXml = oldPkgManifest ? merge(defaultPkg, oldPkgManifest) : defaultPkg;
  const newContent = writePackage(newPkgXml);

  if (fileExists && readFileSync(manifestPath, "utf-8") === newContent) {
    return null;
  }

  return newContent;
}
