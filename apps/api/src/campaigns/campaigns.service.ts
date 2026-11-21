import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, ne, sql } from 'drizzle-orm';
import {
  CampaignOverlapError,
  CampaignStateError,
  assertNoCampaignOverlap,
  businessDate,
  listCampaigns,
  transitionCampaign,
  type Clock,
  type OverlapCampaign,
} from '@moss/domain';
import type {
  ApiError,
  Campaign,
  CampaignListQuery,
  CampaignType,
  CreateCampaign,
} from '@moss/contracts';
import { guardWrite, postgresErrorCode, runDomainRule } from '../common/domain-errors.js';
import { DATABASE, type Database } from '../database/database.module.js';
import { campaignEvents, campaignTypes, campaigns } from '../database/schema.js';
import { CLOCK } from './clock.js';

type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
type Executor = Database | Transaction;

const campaignFields = {
  id: campaigns.id,
  name: campaigns.name,
  status: campaigns.status,
  budget: campaigns.budget,
  startDate: campaigns.startDate,
  endDate: campaigns.endDate,
  reinvestmentBps: campaigns.reinvestmentBps,
  notes: campaigns.notes,
  allowsOverlap: campaigns.allowsOverlap,
  typeId: campaignTypes.id,
  typeName: campaignTypes.name,
};
type CampaignRow = {
  id: string;
  name: string;
  status: 'draft' | 'scheduled' | 'closed' | 'cancelled';
  budget: number;
  startDate: string | null;
  endDate: string | null;
  reinvestmentBps: number;
  notes: string | null;
  allowsOverlap: boolean;
  typeId: string;
  typeName: string;
};

const notFound = () =>
  new NotFoundException({ code: 'CAMPAIGN_NOT_FOUND', message: 'No se encontró la campaña.' });
const typeNotFound = () =>
  new NotFoundException({
    code: 'CAMPAIGN_TYPE_NOT_FOUND',
    message: 'No se encontró el tipo de campaña.',
  });

/** 409 `OVERLAP` con las campañas con las que choca, para que la interfaz las nombre. */
function overlapConflict(error: CampaignOverlapError): ConflictException {
  const body: ApiError = {
    code: error.code,
    message: error.message,
    details: { conflicts: error.conflicts },
  };
  return new ConflictException(body);
}

function dates(row: { startDate: string | null; endDate: string | null }) {
  return {
    startDate: row.startDate === null ? null : businessDate(row.startDate),
    endDate: row.endDate === null ? null : businessDate(row.endDate),
  };
}

/** Orquesta D4 (estados y transiciones) y D5 (empalme); la base respalda con EXCLUDE. */
@Injectable()
export class CampaignsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async types(): Promise<CampaignType[]> {
    return this.db
      .select({
        id: campaignTypes.id,
        name: campaignTypes.name,
        allowsOverlap: campaignTypes.allowsOverlap,
      })
      .from(campaignTypes)
      .orderBy(sql`lower(${campaignTypes.name})`);
  }

  async list(query: CampaignListQuery): Promise<Campaign[]> {
    const rows = await this.rows(this.db);
    const listed = listCampaigns(
      rows.map((row) => ({ ...row, ...dates(row) })),
      this.clock,
      { ...(query.status && { status: query.status }), awaitingClose: query.awaitingClose },
    );
    return listed.map((row) => this.present(row));
  }

  async create(input: CreateCampaign): Promise<Campaign> {
    const [type] = await this.db
      .select({ id: campaignTypes.id, allowsOverlap: campaignTypes.allowsOverlap })
      .from(campaignTypes)
      .where(eq(campaignTypes.id, input.campaignTypeId));
    if (!type) throw typeNotFound();
    const [created] = await guardWrite(
      () =>
        this.db
          .insert(campaigns)
          .values({
            name: input.name,
            campaignTypeId: type.id,
            allowsOverlap: type.allowsOverlap,
            budget: input.budget,
            startDate: input.startDate,
            endDate: input.endDate,
            // Porcentaje entero → puntos base (§8 regla 7).
            reinvestmentBps: input.reinvestmentPercent * 100,
            notes: input.notes,
          })
          .returning({ id: campaigns.id }),
      { foreignKey: typeNotFound },
    );
    return this.one(this.db, created!.id);
  }

  /**
   * Programar (D4) en una transacción: bloquea la campaña, valida la transición y el empalme (D5),
   * guarda el estado y su evento de bitácora juntos. Si otra programación simultánea gana la
   * carrera, el EXCLUDE de la base rechaza esta (23P01) y se responde el mismo 409.
   */
  async schedule(
    id: string,
    reason: string | null,
    actor: { userId: string; partnerId: string },
  ): Promise<Campaign> {
    try {
      return await this.db.transaction(async (tx) => {
        const [row] = await tx
          .select(campaignFields)
          .from(campaigns)
          .innerJoin(campaignTypes, eq(campaignTypes.id, campaigns.campaignTypeId))
          .where(eq(campaigns.id, id))
          .for('update', { of: campaigns });
        if (!row) throw notFound();
        const schedule = { status: row.status, ...dates(row) };
        const transition = runDomainRule(CampaignStateError, () =>
          transitionCampaign(schedule, 'schedule', { clock: this.clock, reason }),
        );
        const existing = await this.scheduledOfType(tx, row.typeId, id);
        try {
          assertNoCampaignOverlap(
            { id, type: row.typeId, allowsOverlap: row.allowsOverlap, ...dates(row) },
            existing,
          );
        } catch (error) {
          if (error instanceof CampaignOverlapError) throw overlapConflict(error);
          throw error;
        }
        await tx
          .update(campaigns)
          .set({ status: transition.status, updatedAt: sql`now()` })
          .where(eq(campaigns.id, id));
        await tx.insert(campaignEvents).values({
          campaignId: id,
          type: transition.event.action,
          fromStatus: row.status,
          toStatus: transition.status,
          actorUserId: actor.userId,
          reason: transition.event.reason,
          payload: { partnerId: actor.partnerId },
        });
        return this.one(tx, id);
      });
    } catch (error) {
      if (postgresErrorCode(error) === '23P01') throw await this.raceConflict(id);
      throw error;
    }
  }

  /** Vuelve a correr la regla de D5 con los datos ya confirmados para nombrar la campaña ganadora. */
  private async raceConflict(id: string): Promise<ConflictException> {
    const [row] = await this.rows(this.db, id);
    if (row) {
      try {
        assertNoCampaignOverlap(
          { id, type: row.typeId, allowsOverlap: row.allowsOverlap, ...dates(row) },
          await this.scheduledOfType(this.db, row.typeId, id),
        );
      } catch (error) {
        if (error instanceof CampaignOverlapError) return overlapConflict(error);
        throw error;
      }
    }
    return new ConflictException({
      code: 'OVERLAP',
      message:
        'Otra campaña del mismo tipo acaba de ocupar esas fechas. Recarga e intenta de nuevo.',
      details: { conflicts: [] },
    });
  }

  private async scheduledOfType(
    db: Executor,
    typeId: string,
    excludeId: string,
  ): Promise<OverlapCampaign[]> {
    const rows = await db
      .select({
        id: campaigns.id,
        name: campaigns.name,
        status: campaigns.status,
        startDate: campaigns.startDate,
        endDate: campaigns.endDate,
      })
      .from(campaigns)
      .where(
        and(
          eq(campaigns.campaignTypeId, typeId),
          eq(campaigns.status, 'scheduled'),
          ne(campaigns.id, excludeId),
        ),
      );
    return rows.map((other) => ({ ...other, type: typeId, ...dates(other) }));
  }

  private rows(db: Executor, id?: string): Promise<CampaignRow[]> {
    return db
      .select(campaignFields)
      .from(campaigns)
      .innerJoin(campaignTypes, eq(campaignTypes.id, campaigns.campaignTypeId))
      .where(id === undefined ? undefined : eq(campaigns.id, id))
      .orderBy(asc(campaigns.createdAt), asc(campaigns.id));
  }

  private async one(db: Executor, id: string): Promise<Campaign> {
    const [row] = await this.rows(db, id);
    if (!row) throw notFound();
    const [listed] = listCampaigns([{ ...row, ...dates(row) }], this.clock);
    return this.present(listed!);
  }

  private present(
    row: ReturnType<typeof listCampaigns<CampaignRow & ReturnType<typeof dates>>>[number],
  ): Campaign {
    return {
      id: row.id,
      name: row.name,
      type: { id: row.typeId, name: row.typeName, allowsOverlap: row.allowsOverlap },
      status: row.status,
      budget: row.budget,
      startDate: row.startDate,
      endDate: row.endDate,
      reinvestmentPercent: row.reinvestmentBps / 100,
      notes: row.notes,
    };
  }
}
