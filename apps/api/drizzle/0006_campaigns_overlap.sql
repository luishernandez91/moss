-- K1 · Empalme de campañas (AGENTS.md regla 6, §8 regla 6; decisión «Empalme por tipo: los eventos
-- pueden empalmarse»). Drizzle no expresa EXCLUDE, por eso va en esta migración personalizada.
-- btree_gist (instalada en 0000_extensions) permite combinar `=` sobre uuid con `&&` sobre daterange.
-- Solo participan las campañas guardadas como `scheduled` (programada, activa y por cerrar) cuyo
-- tipo no permite empalme; allows_overlap es una copia del tipo, protegida por la FK compuesta.
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_no_overlap"
  EXCLUDE USING gist ("campaign_type_id" WITH =, daterange("start_date", "end_date", '[]') WITH &&)
  WHERE ("status" = 'scheduled' AND NOT "allows_overlap");--> statement-breakpoint

-- Tipos de campaña de la especificación (§6, §10 y pantalla 24): temporada y evento. Sin interfaz
-- hasta S2. Un pedido para evento crea una campaña de tipo evento, que sí puede empalmarse.
INSERT INTO "campaign_types" ("name", "allows_overlap") VALUES
  ('Temporada', false),
  ('Evento', true)
ON CONFLICT DO NOTHING;
--> statement-breakpoint

-- Solo se elimina un borrador (§5, D4 `assertCanDelete`). La bitácora se borra en cascada con la
-- campaña, así que la base impide borrar cualquier otra campaña, también por SQL directo
-- (AGENTS.md: nunca borrar datos de campañas cerradas).
CREATE FUNCTION "campaigns_only_drafts_deletable"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."status" <> 'draft' THEN
    RAISE EXCEPTION 'Solo se puede eliminar una campaña en borrador (estado: %).', OLD."status"
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN OLD;
END;
$$;--> statement-breakpoint

CREATE TRIGGER "campaigns_only_drafts_deletable"
  BEFORE DELETE ON "campaigns"
  FOR EACH ROW EXECUTE FUNCTION "campaigns_only_drafts_deletable"();
