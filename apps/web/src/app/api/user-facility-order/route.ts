import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  try {
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

    const { data: orders, error } = await supabase
      .from('user_facility_order')
      .select('facility_id, position')
      .eq('user_id', user.id)
      .order('position');

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ orders: orders || [] });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
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
    const { orders } = body;

    if (!Array.isArray(orders)) {
      return NextResponse.json({ error: 'orders must be an array' }, { status: 400 });
    }

    // 既存の並び順を全削除
    const { error: deleteError } = await supabase
      .from('user_facility_order')
      .delete()
      .eq('user_id', user.id);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    // 新しい並び順を一括INSERT
    if (orders.length > 0) {
      const rows = orders.map((o: { facility_id: string; position: number }) => ({
        user_id: user.id,
        facility_id: o.facility_id,
        position: o.position,
      }));

      const { error: insertError } = await supabase
        .from('user_facility_order')
        .insert(rows);

      if (insertError) {
        return NextResponse.json({ error: insertError.message }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
