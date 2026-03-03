import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_ENV_PATH = path.resolve(__dirname, "../.env");

function parseEnvLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;

  const eqIndex = trimmed.indexOf("=");
  if (eqIndex <= 0) return null;

  const key = trimmed.slice(0, eqIndex).trim();
  if (!key) return null;

  let value = trimmed.slice(eqIndex + 1).trim();
  if (
    (value.startsWith("\"") && value.endsWith("\"")) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  return { key, value };
}

/**
 * Loads `.env` into process.env if the key is not already set.
 * Existing process env variables are never overridden.
 */
export function loadEnvIntoProcess(envPath = DEFAULT_ENV_PATH) {
  const result = {
    envPath,
    envLoaded: false,
    loadedKeys: [],
    skippedKeys: [],
    missingFile: false,
  };

  if (!fs.existsSync(envPath)) {
    result.missingFile = true;
    return result;
  }

  const raw = fs.readFileSync(envPath, "utf8");
  result.envLoaded = true;
  const lines = raw.split(/\r?\n/);

  for (const line of lines) {
    const parsed = parseEnvLine(line);
    if (!parsed) continue;

    const { key, value } = parsed;
    const hasKey = Object.prototype.hasOwnProperty.call(process.env, key);
    if (!hasKey || process.env[key] === undefined) {
      process.env[key] = value;
      result.loadedKeys.push(key);
    } else {
      result.skippedKeys.push(key);
    }
  }

  return result;
}

