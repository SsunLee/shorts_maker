/** @type {import('next').NextConfig} */
function sanitizeNamespace(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const distNamespace =
  process.env.NEXT_DIST_NAMESPACE ||
  process.env.AUTOMATION_NAMESPACE ||
  process.env.SETTINGS_NAMESPACE ||
  process.env.PORT ||
  "";

const resolvedDistDir = sanitizeNamespace(distNamespace);
const isProduction = process.env.NODE_ENV === "production";

const nextConfig = {
  reactStrictMode: true,
  // Keep per-port dist only in local dev; production (Vercel/Cloud) uses default .next.
  ...(!isProduction && resolvedDistDir ? { distDir: `.next-${resolvedDistDir}` } : {})
};

module.exports = nextConfig;
