import { defineConfig } from 'vite';
import {
  appendFileSync,
  existsSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

// Dev-only middleware: the game POSTs each chant to /__chantlog and we append
// it to chantlog.ndjson on disk. This sidesteps localStorage being isolated
// per browser profile — the log lands in a file the reviewer can read directly.
function chantLogPlugin() {
  return {
    name: 'chant-log-sink',
    configureServer(server) {
      server.middlewares.use('/__chantlog', (req, res) => {
        if (req.method === 'POST') {
          let body = '';
          req.on('data', (c) => { body += c; });
          req.on('end', () => {
            try { appendFileSync('chantlog.ndjson', body.trim() + '\n'); } catch (e) { /* ignore */ }
            res.statusCode = 204;
            res.end();
          });
        } else if (req.method === 'DELETE') {
          try { writeFileSync('chantlog.ndjson', ''); } catch (e) { /* ignore */ }
          res.statusCode = 204;
          res.end();
        } else {
          res.statusCode = 405;
          res.end();
        }
      });
    },
  };
}

// Dev-only sprite catalogue. The gallery asks this endpoint instead of keeping
// a second hand-maintained character list, so newly generated atlases appear
// after a refresh and missing/fallback registrations stay visible to artists.
function spriteDebugManifestPlugin() {
  const extractObjectEntries = (source, declaration) => {
    const start = source.indexOf(declaration);
    if (start === -1) return [];
    const bodyStart = source.indexOf('{', start);
    const bodyEnd = source.indexOf('});', bodyStart);
    if (bodyStart === -1 || bodyEnd === -1) return [];
    const body = source.slice(bodyStart + 1, bodyEnd);
    return [...body.matchAll(/^\s*(?:['"]([^'"]+)['"]|([\w-]+))\s*:\s*['"]([^'"]+)['"]\s*,?/gm)]
      .map((match) => [match[1] || match[2], match[3]]);
  };

  return {
    name: 'sprite-debug-manifest',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__sprite-debug/manifest', (_req, res) => {
        try {
          const projectRoot = process.cwd();
          const animatorPath = join(projectRoot, 'src/ui/spriteAnimator.js');
          const animatorSource = readFileSync(animatorPath, 'utf8');
          const registrations = Object.fromEntries(
            extractObjectEntries(animatorSource, 'const SPRITE_SHEETS'),
          );
          const portraitEntries = extractObjectEntries(
            animatorSource,
            'export const ENEMY_SPRITE_BY_PORTRAIT',
          );
          const expectedKeys = new Set([
            'lqz',
            ...Object.keys(registrations),
            ...portraitEntries.map(([, key]) => key),
          ]);

          const spriteRoot = join(projectRoot, 'public/sprites');
          const physicalKeys = existsSync(spriteRoot)
            ? readdirSync(spriteRoot, { withFileTypes: true })
              .filter((entry) => entry.isDirectory() && existsSync(join(spriteRoot, entry.name, 'combat.png')))
              .map((entry) => entry.name)
            : [];
          physicalKeys.forEach((key) => expectedKeys.add(key));

          const defaultFallback = registrations.moyao || '/sprites/moyao/combat.png';
          const characters = [...expectedKeys].sort((a, b) => a.localeCompare(b)).map((key) => {
            const requestedUrl = registrations[key] || `/sprites/${key}/combat.png`;
            const requestedExists = existsSync(join(projectRoot, 'public', requestedUrl.replace(/^\//, '')));
            const physicalOwner = requestedUrl.match(/^\/sprites\/([^/]+)\/combat\.png$/)?.[1] || '';
            const mode = !requestedExists
              ? 'missing'
              : physicalOwner !== key
                ? 'alias'
                : 'original';
            return {
              key,
              requestedUrl,
              displayUrl: requestedExists ? requestedUrl : defaultFallback,
              mode,
              fallbackKey: requestedExists ? (physicalOwner || key) : 'moyao',
              registered: Object.hasOwn(registrations, key),
            };
          });

          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.setHeader('Cache-Control', 'no-store');
          res.end(JSON.stringify({ characters, generatedAt: new Date().toISOString() }));
        } catch (error) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
        }
      });
    },
  };
}

export default defineConfig({
  root: '.',
  plugins: [chantLogPlugin(), spriteDebugManifestPlugin()],
  build: {
    outDir: 'dist',
  },
});
