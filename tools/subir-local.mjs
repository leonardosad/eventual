// Sube site/data/local.json al repositorio (lo usa la tarea que corre en la compu local).
// Está en Node para funcionar igual en Windows, Mac o Linux.
import { execSync } from 'node:child_process';
const run = (c) => execSync(c, { stdio: 'inherit' });
const out = (c) => execSync(c).toString().trim();
run('git config user.name "agenda-bot"');
run('git config user.email "agenda-bot@users.noreply.github.com"');
run('git add site/data/local.json');
if (!out('git diff --cached --name-only')) { console.log('Sin cambios en local.json'); process.exit(0); }
run(`git commit -m "Fuentes locales actualizadas ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC"`);
for (let i = 1; i <= 3; i++) {
  try { run('git pull --rebase -X theirs origin main'); run('git push origin HEAD:main'); break; }
  catch (e) { if (i === 3) throw e; console.log(`Reintento ${i}…`); }
}
