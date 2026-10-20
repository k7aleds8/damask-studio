// Builds the plugin with esbuild and joins the stylesheets, adding the
// generated left-to-right overrides. --watch rebuilds on change, --deploy
// copies the output into a vault whose path comes from DAMASCENE_VAULT or a
// one-line .vault-path file.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import esbuild from 'esbuild';
import { generateLtr } from './gen-ltr.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const args = new Set(process.argv.slice(2));
const watch = args.has('--watch');
const deploy = args.has('--deploy');

function vaultDir() {
  if (process.env.DAMASCENE_VAULT) return process.env.DAMASCENE_VAULT;
  const file = path.join(root, '.vault-path');
  if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8').trim();
  return null;
}

function styles() {
  const dir = path.join(root, 'styles');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.css')).sort();
  const css = [...files.map((f) => fs.readFileSync(path.join(dir, f), 'utf8').trimEnd()), generateLtr(dir)].join('\n\n');
  fs.mkdirSync(dist, { recursive: true });
  fs.writeFileSync(path.join(dist, 'styles.css'), css + '\n');
}

function outputs() {
  fs.copyFileSync(path.join(root, 'manifest.json'), path.join(dist, 'manifest.json'));
  return ['main.js', 'manifest.json', 'styles.css'].map((f) => path.join(dist, f));
}

function copyToVault() {
  if (!deploy) return;
  const vault = vaultDir();
  if (!vault) {
    console.warn('deploy skipped: set DAMASCENE_VAULT or create .vault-path');
    return;
  }
  const target = path.join(vault, '.obsidian', 'plugins', 'damascene-studio');
  fs.mkdirSync(target, { recursive: true });
  for (const f of outputs()) fs.copyFileSync(f, path.join(target, path.basename(f)));
  console.log(`deployed to ${vault}`);
}

const ctx = await esbuild.context({
  entryPoints: [path.join(root, 'src', 'main.ts')],
  bundle: true,
  format: 'cjs',
  target: 'es2021',
  platform: 'browser',
  external: ['obsidian', 'electron', '@codemirror/*', '@lezer/*'],
  outfile: path.join(dist, 'main.js'),
  sourcemap: watch ? 'inline' : false,
  minify: false,
  logLevel: 'info',
  plugins: [{
    name: 'after-build',
    setup(b) {
      b.onEnd((r) => {
        if (r.errors.length) return;
        styles();
        outputs();
        copyToVault();
      });
    },
  }],
});

if (watch) {
  await ctx.watch();
  const rebuildCss = () => { try { styles(); outputs(); copyToVault(); } catch (e) { console.error(e.message); } };
  fs.watch(path.join(root, 'styles'), rebuildCss);
  console.log('watching…');
} else {
  await ctx.rebuild();
  await ctx.dispose();
}
