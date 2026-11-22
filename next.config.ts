import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["undici"],
  // O selo do Next no canto cobria o botão da conta.
  devIndicators: false,
};

export default nextConfig;
