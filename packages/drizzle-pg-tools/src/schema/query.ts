export const extractSchemaSQLQuery = `WITH
  -- 1. ENUMS: Gather all user-defined enum types and their possible values.
  enums AS (
    SELECT
      t.typname AS enum_name,
      jsonb_agg(e.enumlabel ORDER BY e.enumsortorder) AS "values"
    FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
    WHERE
      n.nspname = 'public'
    GROUP BY
      t.typname
  ),
  -- 2. VIEWS: Gather all views and their definitions.
  views AS (
    SELECT
      v.table_name AS view_name,
      v.view_definition AS definition
    FROM
      information_schema.views v
    WHERE
      v.table_schema = 'public'
  ),
  -- 3. TABLE DETAILS: This section is broken into multiple CTEs for clarity.
  -- 3a. COLUMNS: Gather detailed information for each column in each table.
  table_columns AS (
    SELECT
      c.table_name,
      jsonb_agg(
        jsonb_build_object(
          'name',
          c.column_name,
          'position',
          c.ordinal_position,
          'data_type',
          c.data_type,
          'is_nullable',
          CASE WHEN c.is_nullable = 'YES' THEN true ELSE false END,
          'default',
          c.column_default,
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
    WHERE
      c.table_schema = 'public'
    GROUP BY
      c.table_name
  ),
  -- 3b. CONSTRAINTS: Gather PRIMARY KEY, UNIQUE, and CHECK constraints.
  table_constraints AS (
    SELECT
      rel.relname AS table_name,
      jsonb_agg(
        jsonb_build_object(
          'name',
          con.conname,
          'type',
          CASE con.contype
            WHEN 'p' THEN 'PRIMARY KEY'
            WHEN 'u' THEN 'UNIQUE'
            WHEN 'c' THEN 'CHECK'
          END,
          'definition',
          pg_get_constraintdef(con.oid)
        )
      ) AS constraints
    FROM
      pg_catalog.pg_constraint con
      JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
      JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE
      nsp.nspname = 'public'
      AND con.contype IN ('p', 'u', 'c') -- Exclude Foreign Keys, handled separately
    GROUP BY
      rel.relname
  ),
  -- 3c. DETAILED INDEXES: Gather detailed index information and the full definition.
  detailed_indexes AS (
    SELECT
      tc.relname AS table_name,
      jsonb_agg(
        jsonb_build_object(
          'name',
          ic.relname,
          'definition',
          pg_get_indexdef(ic.oid), -- Added the full index definition string
          'is_unique',
          i.indisunique,
          'is_valid',
          i.indisvalid,
          'index_type',
          am.amname,
          'columns',
          idx_cols.columns,
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
      -- This LATERAL join unnests the index keys to get column details
      LEFT JOIN LATERAL (
        SELECT
          jsonb_agg(
            jsonb_build_object(
              'name',
              a.attname,
              'sort_order',
              CASE
                WHEN (ix.option & 1) <> 0 THEN 'DESC'
                ELSE 'ASC'
              END,
              'nulls_order',
              CASE
                WHEN (ix.option & 2) <> 0 THEN 'NULLS FIRST'
                ELSE 'NULLS LAST'
              END
            )
            ORDER BY
              ix.ord
          ) AS columns
        FROM
          unnest(i.indkey, i.indoption) WITH ORDINALITY AS ix (key, option, ord)
          JOIN pg_attribute a ON a.attrelid = i.indrelid
          AND a.attnum = ix.key
      ) idx_cols ON true
    WHERE
      n.nspname = 'public'
      AND tc.relkind = 'r' -- only for tables
    GROUP BY
      tc.relname
  ),
  -- 3d. FOREIGN KEYS: Gather detailed foreign key relationships.
  foreign_keys AS (
    SELECT
      kcu.table_name,
      jsonb_agg(
        jsonb_build_object(
          'name',
          rc.constraint_name,
          'columns',
          (
            SELECT
              jsonb_agg(kcu2.column_name)
            FROM
              information_schema.key_column_usage AS kcu2
            WHERE
              kcu2.constraint_name = rc.constraint_name
              AND kcu2.table_schema = rc.constraint_schema
          ),
          'foreign_table',
          ccu.table_name,
          'foreign_columns',
          (
            SELECT
              jsonb_agg(ccu2.column_name)
            FROM
              information_schema.constraint_column_usage AS ccu2
            WHERE
              ccu2.constraint_name = rc.constraint_name
              AND ccu2.constraint_schema = rc.constraint_schema
          ),
          'on_update',
          rc.update_rule,
          'on_delete',
          rc.delete_rule,
          'match_option',
          rc.match_option
        )
      ) AS foreign_keys
    FROM
      information_schema.referential_constraints rc
      JOIN information_schema.key_column_usage kcu ON rc.constraint_name = kcu.constraint_name
      AND rc.constraint_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage ccu ON rc.unique_constraint_name = ccu.constraint_name
      AND rc.unique_constraint_schema = ccu.table_schema
    WHERE
      kcu.table_schema = 'public'
    GROUP BY
      kcu.table_name
  ),
  -- 4. TABLES_JSON: Assemble all table-related details into a single JSON object per table.
  tables_json AS (
    SELECT
      t.table_name,
      jsonb_build_object(
        'name',
        t.table_name,
        'columns',
        COALESCE(tc.columns, '[]'::jsonb),
        'constraints',
        COALESCE(tcon.constraints, '[]'::jsonb),
        'indexes',
        COALESCE(ti.indexes, '[]'::jsonb),
        'foreign_keys',
        COALESCE(fk.foreign_keys, '[]'::jsonb)
      ) AS table_data
    FROM
      information_schema.tables t
      LEFT JOIN table_columns tc ON t.table_name = tc.table_name
      LEFT JOIN table_constraints tcon ON t.table_name = tcon.table_name
      LEFT JOIN detailed_indexes ti ON t.table_name = ti.table_name
      LEFT JOIN foreign_keys fk ON t.table_name = fk.table_name
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
            jsonb_build_object('name', e.enum_name, 'values', e.values)
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
            jsonb_build_object('name', v.view_name, 'definition', v.definition)
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
