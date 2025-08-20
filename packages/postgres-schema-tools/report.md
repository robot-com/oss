# 📄 Schema Difference Report: `Current` vs `New`
> Generated at: 2025-08-20T16:09:31.487Z

## 📜 Enums
- ➕ Added Enum: `maintenance_entry_event`
- ➕ Added Enum: `maintenance_operation`

## 📜 Views
- 🔄 Modified View: `full_bots`
  - Definition changed: ` SELECT remi_bot.id,
    remi_maintenance_bots.fleet_type,
    remi_bot.availability_status,
        CASE
            WHEN (remi_bot.id !~ '^4[A-H][0-9]+$'::text) THEN 'simulated'::text
            WHEN (remi_bot.availability_status = 'available'::text) THEN 'functional'::text
            WHEN (remi_bot.availability_status = 'maintenance'::text) THEN 'maintenance'::text
            ELSE 'dead'::text
        END AS "statusFB",
    remi_maintenance_bots.status,
    remi_maintenance_bots.bot_use,
    COALESCE(remi_maintenance_bots.location_id, remi_bot.location_id) AS "locationId",
    remi_maintenance_bots.autonomy_status,
    remi_maintenance_bots.supporting_autonomy,
    remi_maintenance_bots.wireless_charging_system,
    remi_maintenance_bots.updated_at,
    remi_maintenance_bots.last_symptom,
    remi_maintenance_bots.last_symptom_date,
    remi_maintenance_bots.last_diagnostic,
    remi_maintenance_bots.last_diagnostic_date,
    remi_maintenance_bots.sim,
    remi_maintenance_bots.flag_status,
    remi_maintenance_bots.engines,
    remi_maintenance_bots.waterproof_screen,
    remi_maintenance_bots.waterproof_packaging_holder,
    remi_maintenance_bots.camera_holder_upgrade,
    remi_maintenance_bots.rain_lid_v2,
    remi_maintenance_bots.main_connector_support,
    remi_maintenance_bots.main_connector_gasket,
    remi_maintenance_bots.complete_waterproof,
    remi_maintenance_bots.stack_2d,
    remi_maintenance_bots.devkit_installed,
    remi_maintenance_bots.lidar_converter_installed
   FROM (remi_bot
     LEFT JOIN remi_maintenance_bots ON ((remi_bot.id = remi_maintenance_bots.id)));` ➡️ ` SELECT remi_bot.id,
    remi_maintenance_bots.fleet_type,
    remi_bot.availability_status,
        CASE
            WHEN (remi_bot.id !~ '^4[A-H][0-9]+$'::text) THEN 'simulated'::text
            WHEN (remi_bot.availability_status = 'available'::text) THEN 'functional'::text
            WHEN (remi_bot.availability_status = 'maintenance'::text) THEN 'maintenance'::text
            ELSE 'dead'::text
        END AS "statusFB",
    remi_maintenance_bots.status,
    COALESCE(remi_maintenance_bots.location_id, remi_bot.location_id) AS "locationId",
    remi_maintenance_bots.autonomy_status,
    remi_maintenance_bots.bot_use,
    remi_maintenance_bots.supporting_autonomy,
    remi_maintenance_bots.wireless_charging_system,
    remi_maintenance_bots.updated_at,
    remi_maintenance_bots.last_symptom,
    remi_maintenance_bots.last_symptom_date,
    remi_maintenance_bots.last_diagnostic,
    remi_maintenance_bots.last_diagnostic_date,
    remi_maintenance_bots.sim,
    remi_maintenance_bots.flag_status,
    remi_maintenance_bots.engines,
    remi_maintenance_bots.waterproof_screen,
    remi_maintenance_bots.waterproof_packaging_holder,
    remi_maintenance_bots.camera_holder_upgrade,
    remi_maintenance_bots.rain_lid_v2,
    remi_maintenance_bots.main_connector_support,
    remi_maintenance_bots.main_connector_gasket,
    remi_maintenance_bots.complete_waterproof,
    remi_maintenance_bots.stack_2d,
    remi_maintenance_bots.devkit_installed,
    remi_maintenance_bots.lidar_converter_installed
   FROM (remi_bot
     LEFT JOIN remi_maintenance_bots ON ((remi_bot.id = remi_maintenance_bots.id)));`

## 🔲 Tables
- 🔄 Modified 🔲 Table: `remi_categories`
  - ➖ Removed 📊 Column: `enabled`
- 🔄 Modified 🔲 Table: `remi_dynamic_props_saved_values`
  - ➖ Removed 🔗 Foreign Key: `remi_dynamic_props_saved_values_form_id_remi_dynamic_props_form`
- 🔄 Modified 🔲 Table: `remi_ftm_task_catalog`
  - ➖ Removed 📊 Column: `attachment`
  - ➕ Added 📊 Column: `video`
- 🔄 Modified 🔲 Table: `remi_hermes_configuration`
  - ➖ Removed 🔗 Foreign Key: `remi_hermes_configuration_ticket_destination_channel_remi_chann`
- 🔄 Modified 🔲 Table: `remi_location`
  - ➖ Removed 🔑 Constraint: `loc_pid_ext_id`
- 🔄 Modified 🔲 Table: `remi_maintenance_assets`
  - ➕ Added 📊 Column: `is_installed`
- 🔄 Modified 🔲 Table: `remi_maintenance_charging_station`
  - ➖ Removed 🔗 Foreign Key: `remi_maintenance_charging_station_location_id_remi_location_id_`
- 🔄 Modified 🔲 Table: `remi_maintenance_work_orders`
  - ➖ Removed 🔗 Foreign Key: `remi_maintenance_work_orders_asset_id_remi_maintenance_assets_i`
  - ➖ Removed 🔗 Foreign Key: `remi_maintenance_work_orders_entries_id_remi_maintenance_entrie`
  - ➖ Removed 🔗 Foreign Key: `remi_maintenance_work_orders_diagnostic_id_remi_maintenance_dia`
  - ➖ Removed 🔗 Foreign Key: `remi_maintenance_work_orders_operation_id_remi_maintenance_oper`
- 🔄 Modified 🔲 Table: `remi_next_step_v2`
  - 🔄 Modified 📊 Column: `trigger`
    - Default value changed: `''::text` ➡️ `null`
- 🔄 Modified 🔲 Table: `remi_notification`
  - ➖ Removed 🔑 Constraint: `ntf_pid_ext_id_wid`
- 🔄 Modified 🔲 Table: `remi_partner`
  - ➖ Removed 🔑 Constraint: `remi_partner_namespace_unique`
- 🔄 Modified 🔲 Table: `remi_permission_group_permission`
  - ➖ Removed 🔗 Foreign Key: `remi_permission_group_permission_permission_group_id_remi_permi`
- 🔄 Modified 🔲 Table: `remi_permission_group_role`
  - ➖ Removed 🔗 Foreign Key: `remi_permission_group_role_permission_group_id_remi_permission_`
- 🔄 Modified 🔲 Table: `remi_point`
  - ➖ Removed 🔑 Constraint: `point_pid_ext_id_wid`
  - ➖ Removed ⚡️ Index: `point_name_trgm_idx`
  - ➖ Removed ⚡️ Index: `point_partner_geohash_uidx`
- 🔄 Modified 🔲 Table: `remi_step`
  - ➖ Removed 🔑 Constraint: `unq_stp_ext_job`
- 🔄 Modified 🔲 Table: `remi_step_check_v2`
  - 🔄 Modified 📊 Column: `next_step_trigger`
    - Default value changed: `''::text` ➡️ `null`
- 🔄 Modified 🔲 Table: `remi_subcategories`
  - ➖ Removed 📊 Column: `enabled`
- 🔄 Modified 🔲 Table: `remi_tickets`
  - ➕ Added ⚡️ Index: `unique_open_hermes_ticket`
