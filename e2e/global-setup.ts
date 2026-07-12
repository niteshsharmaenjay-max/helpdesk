import { execSync } from "node:child_process";
import path from "node:path";

const serverDir = path.resolve(__dirname, "..", "server");

export default function globalSetup() {
  execSync("bun run test:db:setup", { cwd: serverDir, stdio: "inherit" });
}
