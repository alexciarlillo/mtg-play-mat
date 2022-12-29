/**
 * Base webpack config used across other specific configs
 */

import path from 'path';
import webpack from 'webpack';
import webpackPaths from './webpack.paths';
import { dependencies as externals } from '../../release/app/package.json';

const configuration: webpack.Configuration = {
  externals: [...Object.keys(externals || {})],

  stats: 'errors-only',

  module: {
    rules: [
      {
        test: /\.[jt]sx?$/,
        exclude: /node_modules/,
        use: {
          loader: 'ts-loader',
          options: {
            // Remove this line to enable type checking in webpack builds
            transpileOnly: true,
          },
        },
      },
      {
        test: /\.svg$/,
        use: {
          loader: '@svgr/webpack',
          options: { icon: true },
        },
      },
    ],
  },

  output: {
    path: webpackPaths.srcPath,
    // https://github.com/webpack/webpack/issues/1114
    library: {
      type: 'commonjs2',
    },
  },

  /**
   * Determine the array of extensions that should be used to resolve modules.
   */
  resolve: {
    extensions: ['.js', '.jsx', '.json', '.ts', '.tsx'],
    modules: [
      webpackPaths.srcMainPath,
      path.join(webpackPaths.srcMainPath, 'shared'),
      path.join(webpackPaths.srcMainPath, 'shared/db'),
      path.join(webpackPaths.srcMainPath, 'shared/ipc'),
      path.join(webpackPaths.srcMainPath, 'modules/play-test'),
      path.join(webpackPaths.srcMainPath, 'modules/deck-builder'),
      webpackPaths.srcPath,
      webpackPaths.srcSharedPath,
      path.join(webpackPaths.srcSharedPath, 'util'),
      path.join(webpackPaths.srcSharedPath, 'ipc'),
      path.join(webpackPaths.srcSharedPath, 'models'),
      path.join(webpackPaths.srcRendererPath, 'modules/play-test/board'),
      path.join(webpackPaths.srcRendererPath, 'modules/play-test/hand'),
      path.join(webpackPaths.srcRendererPath, 'modules/deck-builder'),
      path.join(webpackPaths.srcRendererPath, 'start'),
      path.join(webpackPaths.srcRendererPath, 'ui'),
      'node_modules',
    ],
  },

  plugins: [
    new webpack.EnvironmentPlugin({
      NODE_ENV: 'production',
    }),
  ],
};

export default configuration;
