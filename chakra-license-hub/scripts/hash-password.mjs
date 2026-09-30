// Make an ADMIN_USERS entry:   pnpm hash-password admin@chakralabs.lk
// Prompts for the password (not echoed) and prints `email=scrypt:...`.
// Same format and parameters as src/lib/password.ts.
import { randomBytes, scryptSync } from "node:crypto";
import readline from "node:readline";

const email = (process.argv[2] ?? "").trim().toLowerCase();
if (!email.includes("@")) {
  console.error("usage: pnpm hash-password <admin email>");
  process.exit(1);
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
rl._writeToOutput = (s) => {
  if (s.includes("Password")) rl.output.write(s);
};
rl.question("Password (12+ characters): ", (password) => {
  rl.close();
  process.stdout.write("\n");
  if (password.length < 12) {
    console.error("Use at least 12 characters.");
    process.exit(1);
  }
  const salt = randomBytes(16);
  const key = scryptSync(password, salt, 32, { N: 16384, r: 8, p: 1 });
  const hash = ["scrypt", 16384, 8, 1, salt.toString("base64url"), key.toString("base64url")].join(":");
  console.log(`\nAdd to ADMIN_USERS (comma-separate several admins):\n${email}=${hash}`);
});
