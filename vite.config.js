import { defineConfig } from 'vite';
import { appendFileSync, writeFileSync } from 'node:fs';

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

export default defineConfig({
  root: '.',
  plugins: [chantLogPlugin()],
  build: {
    outDir: 'dist',
  },
});
