export const extractSchemaSQLQuery = `WITH
  -- 1. ENUMS: Gather all user-defined enum types, their values, and descriptions.
  enums AS (
    SELECT
      t.typname AS enum_name,
      obj_description(t.oid, 'pg_type') AS description,
      jsonb_agg(e.enumlabel ORDER BY e.enumsortorder) AS "values"
    FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
    WHERE
      n.nspname = 'public'
    GROUP BY
      t.typname,
      t.oid
  ),
  -- 2. VIEWS: Gather all views, their definitions, and descriptions.
  views AS (
    SELECT
      v.table_name AS view_name,
      v.view_definition AS definition,
      obj_description(c.oid, 'pg_class') AS description
    FROM
      information_schema.views v
      JOIN pg_catalog.pg_class c ON c.relname = v.table_name
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE
      v.table_schema = 'public'
      AND n.nspname = 'public'
  ),
  -- 3. TABLE DETAILS: This section is broken into multiple CTEs for clarity.
  -- 3a. COLUMNS: Gather detailed information for each column, including descriptions and identity/generated status.
  table_columns AS (
    SELECT
      c.table_name,
      jsonb_agg(
        jsonb_build_object(
          'name',
          c.column_name,
          'description',
          d.description,
          'position',
          c.ordinal_position,
          'data_type',
          c.data_type,
          'is_nullable',
          CASE WHEN c.is_nullable = 'YES' THEN true ELSE false END,
          'default',
          c.column_default,
          'is_generated',
          c.is_generated <> 'NEVER',
          'generation_expression',
          c.generation_expression,
          'is_identity',
          c.is_identity = 'YES',
          'identity_generation',
          c.identity_generation,
          'max_length',
          c.character_maximum_length,
          'numeric_precision',
          c.numeric_precision,
          'numeric_scale',
          c.numeric_scale,
          'udt_name',
          c.udt_name
        )
        ORDER BY
          c.ordinal_position
      ) AS columns
    FROM
      information_schema.columns c
      -- Join to get table OID for description lookup
      JOIN pg_catalog.pg_class tbl ON tbl.relname = c.table_name
      JOIN pg_catalog.pg_namespace nsp ON nsp.oid = tbl.relnamespace
      AND nsp.nspname = c.table_schema
      -- Join to get column description
      LEFT JOIN pg_catalog.pg_description d ON d.objoid = tbl.oid
      AND d.objsubid = c.ordinal_position
    WHERE
      c.table_schema = 'public'
    GROUP BY
      c.table_name
  ),
  -- 3b. CONSTRAINTS: Gather PRIMARY KEY, UNIQUE, and CHECK constraints with their descriptions.
  table_constraints AS (
    SELECT
      rel.relname AS table_name,
      jsonb_agg(
        jsonb_build_object(
          'name',
          con.conname,
          'description',
          obj_description(con.oid, 'pg_constraint'),
          'type',
          CASE con.contype
            WHEN 'p' THEN 'PRIMARY KEY'
            WHEN 'u' THEN 'UNIQUE'
            WHEN 'c' THEN 'CHECK'
          END,
          'definition',
          pg_get_constraintdef(con.oid),
          'nulls_not_distinct',
          idx.indnullsnotdistinct
        )
      ) AS constraints
    FROM
      pg_catalog.pg_constraint con
      JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
      JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
      LEFT JOIN pg_catalog.pg_index idx ON idx.indexrelid = con.conindid
    WHERE
      nsp.nspname = 'public'
      AND con.contype IN ('p', 'u', 'c') -- Exclude Foreign Keys, handled separately
    GROUP BY
      rel.relname
  ),
  -- 3c. INDEX COLUMNS: Pre-aggregate index column details.
  index_columns AS (
    SELECT
      i.indexrelid AS index_oid,
      jsonb_agg(
        jsonb_build_object(
          'name',
          a.attname,
          'sort_order',
          CASE WHEN (ix.option & 1) <> 0 THEN 'DESC' ELSE 'ASC' END,
          'nulls_order',
          CASE WHEN (ix.option & 2) <> 0 THEN 'NULLS FIRST' ELSE 'NULLS LAST' END
        )
        ORDER BY
          ix.ord
      ) AS columns
    FROM
      pg_index i
      CROSS JOIN LATERAL unnest(i.indkey, i.indoption)
      WITH
        ORDINALITY AS ix (key, option, ord)
      JOIN pg_attribute a ON a.attrelid = i.indrelid
      AND a.attnum = ix.key
      AND NOT a.attisdropped
    GROUP BY
      i.indexrelid
  ),
  -- 3d. DETAILED INDEXES (FIXED): Use an EXISTS subquery to prevent row duplication.
  detailed_indexes AS (
    SELECT
      tc.relname AS table_name,
      jsonb_agg(
        jsonb_build_object(
          'name',
          ic.relname,
          'description',
          obj_description(ic.oid, 'pg_class'),
          'definition',
          pg_get_indexdef(ic.oid),
          'is_unique',
          i.indisunique,
          'nulls_not_distinct',
          i.indnullsnotdistinct,
          'is_constraint_index',
          EXISTS (
            SELECT
              1
            FROM
              pg_constraint
            WHERE
              conindid = ic.oid
          ),
          'is_valid',
          i.indisvalid,
          'index_type',
          am.amname,
          'columns',
          COALESCE(idx_cols.columns, '[]'::jsonb),
          'predicate',
          pg_get_expr(i.indpred, i.indrelid, true)
        )
      ) AS indexes
    FROM
      pg_class tc -- table class
      JOIN pg_index i ON tc.oid = i.indrelid
      JOIN pg_class ic ON ic.oid = i.indexrelid -- index class
      JOIN pg_am am ON ic.relam = am.oid
      JOIN pg_namespace n ON tc.relnamespace = n.oid
      LEFT JOIN index_columns idx_cols ON idx_cols.index_oid = ic.oid
    WHERE
      n.nspname = 'public'
      AND tc.relkind = 'r' -- only for tables
    GROUP BY
      tc.relname
  ),
  -- 3e. FOREIGN KEYS: Gather detailed foreign key relationships and their descriptions.
  foreign_keys AS (
    SELECT
      conrel.relname AS table_name,
      jsonb_agg(
        jsonb_build_object(
          'name',
          con.conname,
          'description',
          obj_description(con.oid, 'pg_constraint'),
          'columns',
          (
            SELECT
              jsonb_agg(a.attname)
            FROM
              unnest(con.conkey) WITH ORDINALITY AS u (attnum, ord)
              JOIN pg_attribute AS a ON a.attrelid = con.conrelid
              AND a.attnum = u.attnum
          ),
          'foreign_table',
          confrel.relname,
          'foreign_columns',
          (
            SELECT
              jsonb_agg(a.attname)
            FROM
              unnest(con.confkey) WITH ORDINALITY AS u (attnum, ord)
              JOIN pg_attribute AS a ON a.attrelid = con.confrelid
              AND a.attnum = u.attnum
          ),
          'on_update',
          CASE con.confupdtype
            WHEN 'a' THEN 'NO ACTION'
            WHEN 'r' THEN 'RESTRICT'
            WHEN 'c' THEN 'CASCADE'
            WHEN 'n' THEN 'SET NULL'
            WHEN 'd' THEN 'SET DEFAULT'
          END,
          'on_delete',
          CASE con.confdeltype
            WHEN 'a' THEN 'NO ACTION'
            WHEN 'r' THEN 'RESTRICT'
            WHEN 'c' THEN 'CASCADE'
            WHEN 'n' THEN 'SET NULL'
            WHEN 'd' THEN 'SET DEFAULT'
          END,
          'match_option',
          CASE con.confmatchtype
            WHEN 'f' THEN 'FULL'
            WHEN 'p' THEN 'PARTIAL'
            WHEN 's' THEN 'SIMPLE'
          END
        )
      ) AS foreign_keys
    FROM
      pg_constraint con
      JOIN pg_class conrel ON con.conrelid = conrel.oid
      JOIN pg_class confrel ON con.confrelid = confrel.oid
      JOIN pg_namespace nsp ON conrel.relnamespace = nsp.oid
    WHERE
      nsp.nspname = 'public'
      AND con.contype = 'f'
    GROUP BY
      conrel.relname
  ),
  -- 3f. TRIGGERS: Gather all triggers, their definitions, and descriptions.
  table_triggers AS (
    SELECT
      rel.relname AS table_name,
      jsonb_agg(
        jsonb_build_object(
          'name',
          tg.tgname,
          'description',
          obj_description(tg.oid, 'pg_trigger'),
          'timing',
          CASE
            WHEN (tg.tgtype & (1 << 1)) <> 0 THEN 'BEFORE'
            WHEN (tg.tgtype & (1 << 6)) <> 0 THEN 'INSTEAD OF'
            ELSE 'AFTER'
          END,
          'event',
          array_to_string(
            ARRAY[
              CASE WHEN (tg.tgtype & (1 << 2)) <> 0 THEN 'INSERT' END,
              CASE WHEN (tg.tgtype & (1 << 3)) <> 0 THEN 'DELETE' END,
              CASE WHEN (tg.tgtype & (1 << 4)) <> 0 THEN 'UPDATE' END,
              CASE WHEN (tg.tgtype & (1 << 5)) <> 0 THEN 'TRUNCATE' END
            ]::text[],
            ' OR '
          ),
          'level',
          CASE WHEN (tg.tgtype & (1 << 0)) <> 0 THEN 'ROW' ELSE 'STATEMENT' END,
          'function_schema',
          pn.nspname,
          'function_name',
          p.proname,
          'definition',
          pg_get_triggerdef(tg.oid)
        )
      ) AS triggers
    FROM
      pg_trigger tg
      JOIN pg_class rel ON tg.tgrelid = rel.oid
      JOIN pg_proc p ON tg.tgfoid = p.oid
      JOIN pg_namespace n ON n.oid = rel.relnamespace
      JOIN pg_namespace pn ON pn.oid = p.pronamespace
    WHERE
      n.nspname = 'public'
      AND NOT tg.tgisinternal
    GROUP BY
      rel.relname
  ),
  -- 4. TABLES_JSON: Assemble all table-related details into a single JSON object per table.
  tables_json AS (
    SELECT
      t.table_name,
      jsonb_build_object(
        'name',
        t.table_name,
        'description',
        d.description,
        'columns',
        COALESCE(tc.columns, '[]'::jsonb),
        'constraints',
        COALESCE(tcon.constraints, '[]'::jsonb),
        'indexes',
        COALESCE(ti.indexes, '[]'::jsonb),
        'foreign_keys',
        COALESCE(fk.foreign_keys, '[]'::jsonb),
        'triggers',
        COALESCE(tr.triggers, '[]'::jsonb)
      ) AS table_data
    FROM
      information_schema.tables t
      JOIN pg_catalog.pg_class tbl ON tbl.relname = t.table_name
      JOIN pg_catalog.pg_namespace nsp ON nsp.oid = tbl.relnamespace
      AND nsp.nspname = t.table_schema
      LEFT JOIN pg_catalog.pg_description d ON d.objoid = tbl.oid
      AND d.objsubid = 0
      LEFT JOIN table_columns tc ON t.table_name = tc.table_name
      LEFT JOIN table_constraints tcon ON t.table_name = tcon.table_name
      LEFT JOIN detailed_indexes ti ON t.table_name = ti.table_name
      LEFT JOIN foreign_keys fk ON t.table_name = fk.table_name
      LEFT JOIN table_triggers tr ON t.table_name = tr.table_name
    WHERE
      t.table_schema = 'public'
      AND t.table_type = 'BASE TABLE'
  )
-- 5. FINAL ASSEMBLY: Combine all top-level elements into the final JSON object.
SELECT
  jsonb_build_object(
    'schema',
    'public',
    'generated_at',
    NOW(),
    'enums',
    COALESCE(
      (
        SELECT
          jsonb_agg(
            jsonb_build_object(
              'name',
              e.enum_name,
              'description',
              e.description,
              'values',
              e.values
            )
          )
        FROM
          enums e
      ),
      '[]'::jsonb
    ),
    'views',
    COALESCE(
      (
        SELECT
          jsonb_agg(
            jsonb_build_object(
              'name',
              v.view_name,
              'description',
              v.description,
              'definition',
              v.definition
            )
          )
        FROM
          views v
      ),
      '[]'::jsonb
    ),
    'tables',
    COALESCE(
      (
        SELECT
          jsonb_agg(tj.table_data ORDER BY tj.table_name)
        FROM
          tables_json tj
      ),
      '[]'::jsonb
    )
  ) AS public_schema_json;`
