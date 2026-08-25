import type { NextConfig } from "next";

const BACKEND = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8002";

const nextConfig: NextConfig = {
    reactCompiler: true,
    async rewrites() {
        return [
            {
                source: "/api/:path*",
                destination: `${BACKEND}/api/:path*`,
            },
        ];
    },
};

export default nextConfig;
