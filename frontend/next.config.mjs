/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${process.env.NEXT_PUBLIC_API_URL || "https://llm-red-teaming-engine-production.up.railway.app"}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
