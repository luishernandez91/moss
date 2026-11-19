import { LoginAttempts } from './login-attempts.js';

describe('bloqueo de login en memoria', () => {
  it('bloquea tras cinco fallos durante 15 minutos y elimina entradas vencidas', () => {
    let now = 0;
    const attempts = new LoginAttempts(() => now);
    for (let i = 0; i < 4; i++) {
      attempts.fail('ip-1');
      expect(attempts.retryAfter('ip-1')).toBe(0);
    }
    attempts.fail('ip-1');
    expect(attempts.retryAfter('ip-1')).toBe(900);
    expect(attempts.retryAfter('ip-2')).toBe(0);
    now = 900_000;
    expect(attempts.retryAfter('ip-1')).toBe(0);
    expect(attempts).toMatchObject({ entries: new Map() });
  });

  it('un éxito reinicia los fallos y la limpieza elimina también contadores antiguos', () => {
    let now = 0;
    const attempts = new LoginAttempts(() => now);
    attempts.fail('ip-1');
    attempts.succeed('ip-1');
    expect(attempts).toMatchObject({ entries: new Map() });
    attempts.fail('ip-antigua');
    now = 900_000;
    attempts.retryAfter('ip-nueva');
    expect(attempts).toMatchObject({ entries: new Map() });
  });
});
