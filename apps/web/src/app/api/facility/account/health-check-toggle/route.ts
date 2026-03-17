import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { account_id, enabled } = body;

  if (!account_id || typeof enabled !== 'boolean') {
    return NextResponse.json({ error: 'account_id and enabled (boolean) are required' }, { status: 400 });
  }

  const { error } = await supabase
    .from('facility_accounts')
    .update({ health_check_enabled: enabled })
    .eq('id', account_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, health_check_enabled: enabled });
}
