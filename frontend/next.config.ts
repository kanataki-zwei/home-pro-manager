import type { NextConfig } from "next";
import withPWAInit from "@ducanh2912/next-pwa";

const raw = (process.env.NEXT_PUBLIC_API_URL || "").trim();
const BACKEND = raw.startsWith("http") ? raw : raw ? `https://${raw}` : "http://127.0.0.1:8002";

const withPWA = withPWAInit({
    dest: "public",
    disable: process.env.NODE_ENV === "development",
    reloadOnOnline: true,
    workboxOptions: {
        disableDevLogs: true,
    },
});

const nextConfig: NextConfig = {
    reactCompiler: true,
    turbopack: {},
    async rewrites() {
        return [
            {
                source: "/api/:path*",
                destination: `${BACKEND}/api/:path*`,
            },
        ];
    },
};

export default withPWA(nextConfig);
