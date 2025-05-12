const path = require('path');

const nodeExternals = require('webpack-node-externals');

module.exports = {
  mode: 'production', // or 'development'
  entry: './src/index.ts',
  target: 'node',
  output: {
    path: path.resolve(__dirname, 'lib'),
    filename: 'index.js',
    libraryTarget: 'commonjs2',
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "../src/"), // Assuming your src is at the project root
    },
    extensions: ['.ts', '.js'],
  },
  externals: [
    nodeExternals({
      allowlist: ['firebase-functions', 'firebase-admin'],
    }),
  ],
};