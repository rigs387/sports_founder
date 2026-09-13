import { readdirSync, readFileSync } from "node:fs";
import { builtinModules } from "node:module";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import ts from "typescript";

// Enforces the architecture rule that the simulation core (and the content schemas it depends
// on) are pure: no UI, DOM, Electron, Node, or Steam imports, and no hidden nondeterminism.
// Imports are default-deny: anything not on a zone's allowlist is a violation.

export interface PureZone {
  name: string;
  dir: string;
  allowedDirs: string[];
  allowedPackages: string[];
}

export interface PurityViolation {
  file: string;
  line: number;
  message: string;
}

export function pureZones(root: string): PureZone[] {
  const src = join(root, "src");
  return [
    {
      name: "simulation core",
      dir: join(src, "sim"),
      allowedDirs: [join(src, "sim"), join(src, "content")],
      allowedPackages: ["pure-rand", "zod"],
    },
    {
      name: "content schemas",
      dir: join(src, "content"),
      allowedDirs: [join(src, "content")],
      allowedPackages: ["zod", "yaml"],
    },
  ];
}

const FORBIDDEN_MEMBERS = new Map([["Math.random", "use the seeded RNG in src/sim/rng.ts"]]);

const FORBIDDEN_GLOBALS = new Map([
  ["Date", "wall-clock time breaks determinism"],
  ["performance", "wall-clock time breaks determinism"],
  ["crypto", "host randomness breaks determinism"],
  ["process", "Node host API"],
  ["require", "Node module loading"],
  ["globalThis", "reaches host globals"],
  ["window", "DOM global"],
  ["document", "DOM global"],
  ["navigator", "DOM global"],
  ["localStorage", "DOM global"],
  ["self", "worker/DOM global"],
]);

function listSourceFiles(dir: string): string[] {
  let entries: import("node:fs").Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries.flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return listSourceFiles(full);
    return /\.(ts|tsx|mts|cts|js|mjs|cjs)$/.test(entry.name) ? [full] : [];
  });
}

function isInside(target: string, dir: string): boolean {
  const rel = relative(dir, target);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function packageName(specifier: string): string {
  const parts = specifier.split("/");
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : (parts[0] ?? specifier);
}

function checkImport(specifier: string, file: string, zone: PureZone, root: string) {
  if (specifier.startsWith(".") || specifier.startsWith("/")) {
    const target = resolve(dirname(file), specifier);
    if (zone.allowedDirs.some((dir) => isInside(target, dir))) return undefined;
    const allowed = zone.allowedDirs.map((dir) => relative(root, dir).replaceAll("\\", "/"));
    return `imports "${specifier}", outside the allowed folders (${allowed.join(", ")})`;
  }
  const name = packageName(specifier);
  if (specifier.startsWith("node:") || builtinModules.includes(name)) {
    return `imports the Node built-in "${specifier}"`;
  }
  if (zone.allowedPackages.includes(name)) return undefined;
  return `imports package "${specifier}", which is not allowed (allowed: ${zone.allowedPackages.join(", ")})`;
}

function isPropertyNameOnly(node: ts.Identifier): boolean {
  const parent = node.parent;
  if (ts.isPropertyAccessExpression(parent)) return parent.name === node;
  if (ts.isQualifiedName(parent)) return parent.right === node;
  if (ts.isBindingElement(parent)) return parent.propertyName === node;
  if (
    ts.isPropertyAssignment(parent) ||
    ts.isPropertySignature(parent) ||
    ts.isPropertyDeclaration(parent) ||
    ts.isMethodDeclaration(parent) ||
    ts.isMethodSignature(parent) ||
    ts.isGetAccessorDeclaration(parent) ||
    ts.isSetAccessorDeclaration(parent) ||
    ts.isEnumMember(parent)
  ) {
    return parent.name === node;
  }
  return false;
}

export function checkPurity(zones: PureZone[], root: string): PurityViolation[] {
  const violations: PurityViolation[] = [];

  for (const zone of zones) {
    for (const file of listSourceFiles(zone.dir)) {
      const text = readFileSync(file, "utf8");
      const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
      const display = relative(root, file).replaceAll("\\", "/");
      const report = (pos: number, message: string) =>
        violations.push({
          file: display,
          line: source.getLineAndCharacterOfPosition(pos).line + 1,
          message: `${zone.name}: ${message}`,
        });

      for (const imported of ts.preProcessFile(text, true, true).importedFiles) {
        const problem = checkImport(imported.fileName, file, zone, root);
        if (problem) report(imported.pos, problem);
      }

      const visit = (node: ts.Node) => {
        if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression)) {
          const member = `${node.expression.text}.${node.name.text}`;
          const reason = FORBIDDEN_MEMBERS.get(member);
          if (reason) report(node.getStart(source), `uses ${member} (${reason})`);
        }
        if (ts.isIdentifier(node) && !isPropertyNameOnly(node)) {
          const reason = FORBIDDEN_GLOBALS.get(node.text);
          if (reason) report(node.getStart(source), `uses ${node.text} (${reason})`);
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
  }
  return violations;
}
