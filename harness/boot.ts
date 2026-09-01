import { buildSeed } from './seed.mjs';
(window as any).__SEED__ = buildSeed();
import('./main');
