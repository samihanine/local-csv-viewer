// Updates dependencies, then runs every check. If anything fails, the previous versions are restored.
import { $ } from "bun";

const latest = process.argv.includes("--latest");
const files = ["package.json", "bun.lock"];
const backup = await Promise.all(files.map((f) => Bun.file(f).text()));

const restore = async () => {
  await Promise.all(files.map((f, i) => Bun.write(f, backup[i] ?? "")));
  await $`bun install`;
};

try {
  await $`bun update ${latest ? ["--latest"] : []}`;
  await $`bun run audit`;
  await $`bun run check`;
  console.log("\n✔ Dependencies updated and all checks passed.");
} catch {
  console.error("\n✖ Checks failed after update, restoring previous versions…");
  await restore();
  process.exit(1);
}
