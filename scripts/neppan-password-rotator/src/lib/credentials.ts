import * as dotenv from 'dotenv';
import * as path from 'path';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });
dotenv.config({ path: path.resolve(__dirname, '../../../../.env.local') });
dotenv.config({ path: path.resolve(__dirname, '../../../../apps/web/.env.local') });

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const VERSION = 'enc_v1';

function getEncryptionKey(): Buffer {
  const keyString = process.env.CREDENTIAL_ENCRYPTION_KEY;
  if (!keyString) throw new Error('CREDENTIAL_ENCRYPTION_KEY is required');
  const key = keyString.length === 64
    ? Buffer.from(keyString, 'hex')
    : Buffer.from(keyString, 'base64');
  if (key.length !== 32) throw new Error('CREDENTIAL_ENCRYPTION_KEY must be 32 bytes');
  return key;
}

export function encryptPassword(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  let ct = cipher.update(plaintext, 'utf8', 'base64');
  ct += cipher.final('base64');
  const tag = cipher.getAuthTag();
  return `${VERSION}:${iv.toString('base64')}:${ct}:${tag.toString('base64')}`;
}

export function decryptPassword(encrypted: string): string {
  const parts = encrypted.split(':');
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error('Invalid encrypted password format');
  }
  const [, ivB64, ctB64, tagB64] = parts;
  const key = getEncryptionKey();
  const iv = Buffer.from(ivB64, 'base64');
  const ct = Buffer.from(ctB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  if (iv.length !== IV_LENGTH || tag.length !== TAG_LENGTH) {
    throw new Error('Invalid encrypted password format');
  }
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  let pt = decipher.update(ct, undefined, 'utf8');
  pt += decipher.final('utf8');
  return pt;
}

function isEncrypted(value: string): boolean {
  return value.startsWith(`${VERSION}:`);
}

export interface NeppanCredentials {
  facility_code: string;
  facility_name: string;
  facility_account_id: string;
  login_id: string;
  password: string;
  login_url: string;
  hotel_id: string;
}

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  }
  return createClient(url, key);
}

const DEFAULT_NEPPAN_LOGIN_URL = 'https://asp.hotel-story.ne.jp/ver3/ASPU0201.asp';

export async function loadNeppanCredentials(facilityCode: string): Promise<NeppanCredentials> {
  const supabase = getSupabase();

  const { data: facility, error: fErr } = await supabase
    .from('facilities')
    .select('id, code, name')
    .eq('code', facilityCode)
    .single();
  if (fErr || !facility) {
    throw new Error(`Facility not found: code=${facilityCode} (${fErr?.message ?? 'no data'})`);
  }

  const { data: channel, error: cErr } = await supabase
    .from('channels')
    .select('id, code, login_url')
    .eq('code', 'neppan')
    .single();
  if (cErr || !channel) {
    throw new Error(`Neppan channel not found (${cErr?.message ?? 'no data'})`);
  }

  const { data: account, error: aErr } = await supabase
    .from('facility_accounts')
    .select('id, login_id, password, password_encrypted, login_url')
    .eq('facility_id', facility.id)
    .eq('channel_id', channel.id)
    .eq('account_type', 'shared')
    .is('user_email', null)
    .single();
  if (aErr || !account) {
    throw new Error(`Neppan account not found for facility=${facilityCode} (${aErr?.message ?? 'no data'})`);
  }

  // password_encrypted 優先、なければ旧 password 列へフォールバック
  let plainPassword: string;
  if (account.password_encrypted) {
    plainPassword = isEncrypted(account.password_encrypted)
      ? decryptPassword(account.password_encrypted)
      : account.password_encrypted;
  } else if (account.password) {
    plainPassword = isEncrypted(account.password)
      ? decryptPassword(account.password)
      : account.password;
  } else {
    throw new Error(`Password not set for facility=${facilityCode} (both password and password_encrypted are null)`);
  }

  const { data: fieldValues, error: fvErr } = await supabase
    .from('account_field_values')
    .select('value, field_definition:account_field_definitions(field_key)')
    .eq('facility_account_id', account.id);
  if (fvErr) {
    throw new Error(`Failed to load extra fields: ${fvErr.message}`);
  }

  let hotelId = '';
  for (const fv of fieldValues ?? []) {
    const def = fv.field_definition as unknown as { field_key: string } | null;
    if (def?.field_key === 'hotel_id') {
      hotelId = fv.value;
      break;
    }
  }

  if (!hotelId) {
    throw new Error(`hotel_id (契約コード) not set for facility=${facilityCode}`);
  }

  return {
    facility_code: facility.code,
    facility_name: facility.name,
    facility_account_id: account.id,
    login_id: account.login_id,
    password: plainPassword,
    login_url: account.login_url || channel.login_url || DEFAULT_NEPPAN_LOGIN_URL,
    hotel_id: hotelId,
  };
}

export function maskPassword(pw: string): string {
  if (!pw) return '';
  if (pw.length <= 2) return '*'.repeat(pw.length);
  return pw[0] + '*'.repeat(pw.length - 2) + pw[pw.length - 1];
}

/**
 * ねっぱんのクレデンシャルを持つ全施設の code を返す。
 * account_type='shared' かつ user_email IS NULL のアカウント対象。
 */
export async function listNeppanFacilityCodes(): Promise<string[]> {
  const supabase = getSupabase();

  const { data: channel, error: cErr } = await supabase
    .from('channels')
    .select('id')
    .eq('code', 'neppan')
    .single();
  if (cErr || !channel) {
    throw new Error(`Neppan channel not found (${cErr?.message ?? 'no data'})`);
  }

  const { data: accounts, error: aErr } = await supabase
    .from('facility_accounts')
    .select('facility_id, facilities:facilities!inner(code, name)')
    .eq('channel_id', channel.id)
    .eq('account_type', 'shared')
    .is('user_email', null);
  if (aErr) {
    throw new Error(`Failed to list neppan facilities: ${aErr.message}`);
  }

  const codes: string[] = [];
  for (const row of accounts ?? []) {
    const fac = row.facilities as unknown as { code: string; name: string } | null;
    if (fac?.code) codes.push(fac.code);
  }
  // 安定したソート順
  codes.sort();
  return codes;
}
