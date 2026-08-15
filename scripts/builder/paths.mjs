/** Shared paths and package metadata for the builder modules. */
import {readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

export const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
export const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
export const CONFIG_PATH = join(ROOT, 'builder.config.json');
export const ENV_PATH = join(ROOT, '.env');
export const DIST_PATH = join(ROOT, 'dist');
