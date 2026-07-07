// ui/next.config.js

const path = require("path");

/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {},   // مقدار صحیح برای Next.js 16

  // 🟦 اجازه دسترسی از آی‌پی سرور
  allowedDevOrigins: ["5.255.121.157"],

  // 🟦 رفع هشدار workspace root
  outputFileTracingRoot: path.join(__dirname, "../"),

  webpack: (config) => {
    return config;
  },
};

module.exports = nextConfig;
