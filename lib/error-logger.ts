import { promises as fs } from "fs";
import path from "path";

const ERROR_LOG_FILE = process.env.ERROR_LOG_FILE?.trim();

function formatError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return { message: String(error) };
}

export async function logError(error: unknown, context?: string) {
  if (!ERROR_LOG_FILE) {
    return;
  }

  const payload = {
    timestamp: new Date().toISOString(),
    context,
    error: formatError(error),
  };

  await fs.mkdir(path.dirname(ERROR_LOG_FILE), { recursive: true });
  await fs.appendFile(ERROR_LOG_FILE, `${JSON.stringify(payload)}\n`, "utf-8");
}
