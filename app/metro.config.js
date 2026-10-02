// Metro config: lets the app import the circadian engine straight from its
// TypeScript sources in ../engine (no build step, no npm publish).
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const engineRoot = path.resolve(projectRoot, '../engine');

const config = getDefaultConfig(projectRoot);

// Watch the engine sources so Metro can bundle (and hot-reload) them.
config.watchFolders = [...(config.watchFolders ?? []), engineRoot];

config.resolver = config.resolver ?? {};
// `import { buildPlan } from '@jetlag/engine'` -> ../engine (package.json "main": "src/index.ts").
config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules ?? {}),
  '@jetlag/engine': engineRoot,
};
// Resolve all third-party modules from the app only; never pick up the
// engine's dev-only node_modules (vitest, typescript, ...).
config.resolver.nodeModulesPaths = [path.resolve(projectRoot, 'node_modules')];
const escape = (p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const engineNodeModules = new RegExp(`^${escape(path.join(engineRoot, 'node_modules'))}(/.*)?$`);
const existing = config.resolver.blockList;
config.resolver.blockList = existing
  ? [].concat(existing, engineNodeModules)
  : [engineNodeModules];

module.exports = config;
