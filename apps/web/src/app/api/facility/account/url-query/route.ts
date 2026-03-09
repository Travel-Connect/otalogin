import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { sanitizeQueryParams } from '@otalogin/shared';

/**
 * PATCH /api/facility/account/url-query
 * URLクエリパラメータを保存する
 */
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient();
    if (!supabase) {
      return NextResponse.json(
        { error: 'Database not configured' },
        { status: 500 }
      );
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { account_id, kind, query } = body as {
      account_id: string;
      kind: 'public' | 'admin';
      query: Record<string, string> | null;
    };

    if (!account_id || !kind || !['public', 'admin'].includes(kind)) {
      return NextResponse.json(
        { error: '必須項目が不足しています' },
        { status: 400 }
      );
    }

    // アカウントの存在確認
    const { data: account, error: accountError } = await supabase
      .from('facility_accounts')
      .select('id')
      .eq('id', account_id)
      .single();

    if (accountError || !account) {
      return NextResponse.json(
        { error: 'アカウントが見つかりません' },
        { status: 404 }
      );
    }

    // クエリパラメータをサニタイズ
    const sanitized = query ? sanitizeQueryParams(query) : null;
    const column = kind === 'public' ? 'public_url_query' : 'admin_url_query';

    const { error: updateError } = await supabase
      .from('facility_accounts')
      .update({ [column]: sanitized })
      .eq('id', account_id);

    if (updateError) {
      return NextResponse.json(
        { error: 'URLクエリの保存に失敗しました' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, query: sanitized });
  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
