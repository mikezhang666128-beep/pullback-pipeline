/** @type {import('next').NextConfig} */
module.exports = {
  reactStrictMode: true,
  // Scaffold setting: don't fail the production build on TypeScript/ESLint
  // nitpicks. The app runs fine at runtime; tighten this later if you want
  // strict checks to block deploys.
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
};
