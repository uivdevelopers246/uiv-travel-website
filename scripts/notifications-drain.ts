import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

function argument(name: string): string | null {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1]?.trim() || null : null;
}

async function main() {
  const baseUrl = argument("base-url");
  const secret = process.env.CRON_SECRET?.trim();
  if (!baseUrl || !secret) {
    throw new Error(
      "Set CRON_SECRET and run: npm run notifications:drain -- --base-url <staging-url>",
    );
  }

  const endpoint = `${baseUrl.replace(/\/$/, "")}/api/cron/notifications`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { authorization: `Bearer ${secret}` },
  });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`Notification worker failed with ${response.status}: ${body}`);
  }
  console.log(body);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
