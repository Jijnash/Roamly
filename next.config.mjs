/** @type {import('next').NextConfig} */
const nextConfig = {
  // Type errors must fail the build (v0 shipped with ignoreBuildErrors: true, which hid real bugs).
  images: {
    unoptimized: true,
  },
}

export default nextConfig
