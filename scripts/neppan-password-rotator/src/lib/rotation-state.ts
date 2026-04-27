/**
 * neppan_password_rotations テーブルの読み書きヘルパー。
 *
 * - markRotationSuccess / markRotationFailure: rotator から呼び出される
 * - listDueFacilities: 30 日経過した施設のコード一覧を返す（rotate-due 用）
 */

import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  }
  return createClient(url, key);
}

async function getFacilityIdByCode(code: string): Promise<string> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('facilities')
    .select('id')
    .eq('code', code)
    .single();
  if (error || !data) {
    throw new Error(`Facility not found: code=${code} (${error?.message ?? 'no data'})`);
  }
  return data.id;
}

interface MarkArgs {
  facilityCode: string;
  status: 'success' | 'failed' | 'in_progress';
  error?: string | null;
  logPath?: string | null;
  /** success の場合、last_rotated_at = NOW() で更新する */
  bumpRotatedAt: boolean;
  /** 成功時に rotation_count を +1 する */
  incrementCount: boolean;
}

export async function markRotation(args: MarkArgs): Promise<void> {
  const supabase = getSupabase();
  const facilityId = await getFacilityIdByCode(args.facilityCode);

  // 既存レコードを確認
  const { data: existing, error: selErr } = await supabase
    .from('neppan_password_rotations')
    .select('id, rotation_count')
    .eq('facility_id', facilityId)
    .maybeSingle();
  if (selErr) {
    throw new Error(`Failed to query neppan_password_rotations: ${selErr.message}`);
  }

  const now = new Date().toISOString();
  const baseUpdate: Record<string, unknown> = {
    last_status: args.status,
    last_error: args.error ?? null,
    last_log_path: args.logPath ?? null,
  };
  if (args.bumpRotatedAt) {
    baseUpdate.last_rotated_at = now;
  }

  if (existing) {
    const update: Record<string, unknown> = { ...baseUpdate };
    if (args.incrementCount) {
      update.rotation_count = (existing.rotation_count ?? 0) + 1;
    }
    const { error: updErr } = await supabase
      .from('neppan_password_rotations')
      .update(update)
      .eq('id', existing.id);
    if (updErr) {
      throw new Error(`Failed to update neppan_password_rotations: ${updErr.message}`);
    }
  } else {
    const insert: Record<string, unknown> = {
      facility_id: facilityId,
      last_rotated_at: args.bumpRotatedAt ? now : new Date(0).toISOString(),
      rotation_count: args.incrementCount ? 1 : 0,
      ...baseUpdate,
    };
    const { error: insErr } = await supabase
      .from('neppan_password_rotations')
      .insert(insert);
    if (insErr) {
      throw new Error(`Failed to insert neppan_password_rotations: ${insErr.message}`);
    }
  }
}

export interface DueFacility {
  facility_code: string;
  facility_name: string;
  last_rotated_at: string | null;
  rotation_count: number;
  last_status: string | null;
}

/**
 * 「30日以上前にローテートした」または「未ローテート」の neppan 施設一覧を返す。
 * facility_code の昇順でソート。
 */
export async function listDueFacilities(daysSince = 30): Promise<DueFacility[]> {
  const supabase = getSupabase();

  const { data: channel, error: cErr } = await supabase
    .from('channels')
    .select('id')
    .eq('code', 'neppan')
    .single();
  if (cErr || !channel) {
    throw new Error(`Neppan channel not found (${cErr?.message ?? 'no data'})`);
  }

  // neppan アカウントを持つ全施設
  const { data: accounts, error: aErr } = await supabase
    .from('facility_accounts')
    .select('facility_id, facilities:facilities!inner(id, code, name)')
    .eq('channel_id', channel.id)
    .eq('account_type', 'shared')
    .is('user_email', null);
  if (aErr) {
    throw new Error(`Failed to list neppan facilities: ${aErr.message}`);
  }

  const allFacilities: { id: string; code: string; name: string }[] = [];
  for (const row of accounts ?? []) {
    const fac = row.facilities as unknown as { id: string; code: string; name: string } | null;
    if (fac?.id) allFacilities.push(fac);
  }
  if (allFacilities.length === 0) {
    return [];
  }

  // それぞれの最終ローテ日時を取得
  const facilityIds = allFacilities.map((f) => f.id);
  const { data: rotations, error: rErr } = await supabase
    .from('neppan_password_rotations')
    .select('facility_id, last_rotated_at, rotation_count, last_status')
    .in('facility_id', facilityIds);
  if (rErr) {
    throw new Error(`Failed to list rotations: ${rErr.message}`);
  }

  const rotationMap = new Map<
    string,
    { last_rotated_at: string | null; rotation_count: number; last_status: string | null }
  >();
  for (const r of rotations ?? []) {
    rotationMap.set(r.facility_id, {
      last_rotated_at: r.last_rotated_at,
      rotation_count: r.rotation_count,
      last_status: r.last_status,
    });
  }

  const cutoff = Date.now() - daysSince * 24 * 60 * 60 * 1000;
  const due: DueFacility[] = [];
  for (const fac of allFacilities) {
    const rot = rotationMap.get(fac.id);
    const lastTs = rot?.last_rotated_at ? new Date(rot.last_rotated_at).getTime() : 0;
    // 未ローテート (rot 無し or last_rotated_at が古い) を due 扱い
    if (!rot || lastTs < cutoff) {
      due.push({
        facility_code: fac.code,
        facility_name: fac.name,
        last_rotated_at: rot?.last_rotated_at ?? null,
        rotation_count: rot?.rotation_count ?? 0,
        last_status: rot?.last_status ?? null,
      });
    }
  }

  due.sort((a, b) => a.facility_code.localeCompare(b.facility_code));
  return due;
}
