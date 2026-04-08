/** @type {import('next').NextConfig} */
const nextConfig = {
  // Transpile deck.gl and related packages for proper ESM handling
  transpilePackages: [
    "deck.gl",
    "@deck.gl/core",
    "@deck.gl/layers",
    "@deck.gl/mapbox",
    "@deck.gl/aggregation-layers",
    "@loaders.gl/core",
    "@loaders.gl/loader-utils",
    "react-map-gl",
  ],

  // Disabled Turbopack because of docker bug
  // turbopack: {},
};

export default nextConfig;

