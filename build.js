import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('[Build] Running Vite build...');
execSync('npx vite build', { stdio: 'inherit' });

console.log('[Build] Copying static runtime assets to dist...');
const files = ['config.js', 'app.js', 'admin.js'];
files.forEach(file => {
  const src = path.join(__dirname, file);
  const dest = path.join(__dirname, 'dist', file);
  fs.copyFileSync(src, dest);
  console.log(`  ✓ Copied ${file} -> dist/${file}`);
});

console.log('[Build] Leaderboard build completed successfully!');
