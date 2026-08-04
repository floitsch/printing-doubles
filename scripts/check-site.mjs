import { readFile, readdir, stat } from "node:fs/promises";
import { dirname, join, normalize, resolve } from "node:path";

const root = resolve("site");
const files = await walk(root);
const htmlFiles = files.filter((file) => file.endsWith(".html"));
const errors = [];

for (const file of htmlFiles) {
  const source = await readFile(file, "utf8");
  if (!/<html\b[^>]*lang=/.test(source)) errors.push(`${file}: missing html lang`);
  if (!/<meta\b[^>]*name="viewport"/.test(source)) errors.push(`${file}: missing viewport`);
  for (const match of source.matchAll(/(?:href|src)="([^"#?]+)(?:[?#][^"]*)?"/g)) {
    const target = match[1];
    if (/^(?:https?:|mailto:|data:)/.test(target)) continue;
    const absolute = normalize(resolve(dirname(file), target));
    if (!absolute.startsWith(root)) continue;
    try { await stat(absolute); } catch { errors.push(`${file}: missing local target ${target}`); }
  }
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Checked ${htmlFiles.length} HTML files and ${files.length} site files.`);
}

async function walk(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await walk(path));
    else result.push(path);
  }
  return result;
}
