const { spawn } = require("child_process");

function parsePort(rawValue) {
  const value = Number.parseInt(String(rawValue || "").trim(), 10);
  if (!Number.isFinite(value) || value < 1 || value > 65535) {
    throw new Error(`Invalid port: ${rawValue}`);
  }
  return value;
}

function sanitizeNamespace(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const port = parsePort(process.argv[2] || process.env.PORT || "3000");
const namespace = sanitizeNamespace(process.argv[3] || `dev-${port}`) || `dev-${port}`;
const origin = `http://localhost:${port}`;

const env = {
  ...process.env,
  PORT: String(port),
  SETTINGS_NAMESPACE: namespace,
  AUTOMATION_NAMESPACE: namespace,
  NEXT_DIST_NAMESPACE: namespace,
  NEXTAUTH_URL: origin,
  NEXT_PUBLIC_APP_URL: origin,
  PUBLIC_BASE_URL: origin,
  YOUTUBE_REDIRECT_URI: `${origin}/oauth2callback`
};

console.log(`[dev-instance] port=${port} namespace=${namespace} nextauth=${env.NEXTAUTH_URL}`);

const child = spawn(
  process.execPath,
  [require.resolve("next/dist/bin/next"), "dev", "-p", String(port)],
  {
    cwd: process.cwd(),
    env,
    stdio: "inherit"
  }
);

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
