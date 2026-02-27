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

const nextConfig = {
  reactStrictMode: true,
  ...(resolvedDistDir ? { distDir: `.next-${resolvedDistDir}` } : {})
};

module.exports = nextConfig;
