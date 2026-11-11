-- Extensiones base.
-- btree_gist permite combinar el tipo de campaña (=) con el rango de fechas (&&)
-- en una restricción EXCLUDE que impide campañas empalmadas (AGENTS.md, regla 6).
CREATE EXTENSION IF NOT EXISTS btree_gist;
