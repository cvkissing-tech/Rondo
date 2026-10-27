import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const [major, minor] = process.versions.node.split(".").map(Number);
if (major < 22 || (major === 22 && minor < 13))
  throw Error("Rondo requires Node.js 22.13+");
function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    windowsHide: true,
  });
  if (result.error || result.status !== 0)
    throw result.error || Error(`${command} failed (${result.status})`);
}
run("git", ["--version"]);
const python = join(
  root,
  ".venv",
  process.platform === "win32" ? "Scripts/python.exe" : "bin/python",
);
const check = process.argv.includes("--check");
if (!existsSync(python)) {
  if (check) throw Error("Python environment missing. Run npm run setup.");
  const candidates =
    process.platform === "win32"
      ? [["py", "-3"], ["python"]]
      : [["python3"], ["python"]];
  const candidate = candidates.find(
    ([exe, ...args]) =>
      spawnSync(
        exe,
        [
          ...args,
          "-c",
          "import sys;sys.exit(0 if sys.version_info >= (3,11) else 1)",
        ],
        { windowsHide: true },
      ).status === 0,
  );
  if (!candidate) throw Error("Install Python 3.11+ first.");
  run(candidate[0], [...candidate.slice(1), "-m", "venv", join(root, ".venv")]);
}
if (check) {
  run(python, [
    "-X",
    "utf8",
    "-c",
    'import agent_review_loop,mcp;print("Rondo Python backend ready")',
  ]);
  console.log(
    "Node/Git/Python ready. Agent authentication is checked by each Agent.",
  );
  process.exit(0);
}
run(python, ["-m", "pip", "install", "-e", "."]);
if (!process.env.npm_execpath || !existsSync(process.env.npm_execpath))
  throw Error("Run this script through npm run setup.");
run(process.execPath, [process.env.npm_execpath, "--prefix", "desktop", "ci"]);
run(process.execPath, [
  process.env.npm_execpath,
  "--prefix",
  "desktop",
  "run",
  "build",
]);
console.log(
  "Ready. Run npm start. Choose your installed Agent in Rondo; no account or model was started by setup.",
);
