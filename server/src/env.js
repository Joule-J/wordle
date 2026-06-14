import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

function loadEnvFile(fileName) {
  const filePath = path.resolve(process.cwd(), fileName);
  if (fs.existsSync(filePath)) {
    dotenv.config({ path: filePath, override: false });
  }
}

loadEnvFile(".env.local");
loadEnvFile(".env");

