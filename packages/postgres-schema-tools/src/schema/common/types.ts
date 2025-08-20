/**
 * Defines the possible referential actions for foreign key constraints.
 */
export type ReferentialAction =
    | 'CASCADE'
    | 'RESTRICT'
    | 'NO ACTION'
    | 'SET NULL'
    | 'SET DEFAULT'

/**
 * Defines the match type for foreign key constraints.
 */
export type MatchOption = 'FULL' | 'PARTIAL' | 'SIMPLE'

/**
 * Defines the type of a table constraint.
 */
export type ConstraintType = 'PRIMARY KEY' | 'UNIQUE' | 'CHECK'

/**
 * Defines the sort order for an indexed column.
 */
export type SortOrder = 'ASC' | 'DESC'

/**
 * Defines the nulls ordering for an indexed column.
 */
export type NullsOrder = 'NULLS FIRST' | 'NULLS LAST'

/**
 * Defines the timing of a trigger's execution.
 */
export type TriggerTiming = 'BEFORE' | 'AFTER' | 'INSTEAD OF'

/**
 * Defines the execution level of a trigger.
 */
export type TriggerLevel = 'ROW' | 'STATEMENT'
