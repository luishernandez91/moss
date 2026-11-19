import { execFileSync } from 'node:child_process';
/** Los socios de prueba son permanentes; cada spec restaura los valores que modifica. */
export default function setup(): void {
  execFileSync(process.execPath, ['test/browser-fixture.mjs'], { cwd: '../api', stdio: 'pipe' });
}
