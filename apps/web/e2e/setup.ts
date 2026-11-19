import { execFileSync } from 'node:child_process';

export default function setup(): () => void {
  const fixture = (action: string) =>
    execFileSync(process.execPath, ['test/browser-fixture.mjs', action], {
      cwd: '../api',
      stdio: 'pipe',
    });
  fixture('create');
  return () => {
    fixture('delete');
  };
}
