// Admin jelszó hash-elése a saját gépeden: npm run hash-admin
// A jelszót rejtve kéri be, és csak a hash-t írja ki.
import { hash } from "@node-rs/argon2";
import readline from "node:readline";

function ask(prompt) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl.stdoutMuted = true;
    rl._writeToOutput = function (s) {
      if (rl.stdoutMuted && !s.startsWith(prompt)) rl.output.write("*");
      else rl.output.write(s);
    };
    rl.question(prompt, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
  });
}

const pw = await ask("Admin jelszó: ");
const pw2 = await ask("Admin jelszó újra: ");
if (pw !== pw2) {
  console.error("A két jelszó nem egyezik.");
  process.exit(1);
}
if (pw.length < 12) {
  console.error("Legalább 12 karakter legyen.");
  process.exit(1);
}
const h = await hash(pw, { algorithm: 2, memoryCost: 19456, timeCost: 2, parallelism: 1, outputLen: 32 });
console.log("\nADMIN_PASSWORD_HASH értéke:\n" + h);
