import { systemClock, type Clock } from '@moss/domain';

/** Reloj inyectable (AGENTS.md regla 7): las pruebas fijan «hoy» con `overrideProvider(CLOCK)`. */
export const CLOCK = Symbol('CLOCK');
export const clockProvider = { provide: CLOCK, useValue: systemClock satisfies Clock };
