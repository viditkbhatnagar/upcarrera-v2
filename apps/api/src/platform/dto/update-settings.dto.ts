import { IsObject } from 'class-validator';

/**
 * Settings are stored as item->value rows in the `settings` table
 * (port of settings_helper::get_settings). PATCH /settings accepts a flat
 * key->value map and upserts one row per key by `item`.
 *
 * Example body: { "site_title": "UpCarrera", "site_logo": "logo.png" }
 */
export class UpdateSettingsDto {
  @IsObject()
  settings!: Record<string, string | number | boolean | null>;
}
