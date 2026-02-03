import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    if (!supabase) {
      return NextResponse.json(
        { error: 'Database not configured' },
        { status: 500 }
      );
    }

    // 認証チェック
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // admin権限チェック
    const { data: userRole } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    if (userRole?.role !== 'admin') {
      return NextResponse.json(
        { error: '管理者権限が必要です' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const {
      facility_id,
      channel_id,
      account_type,
      login_id,
      password,
      field_values,
    } = body;

    // 入力検証
    if (!facility_id || !channel_id || !login_id || !password) {
      return NextResponse.json(
        { error: '必須項目が不足しています' },
        { status: 400 }
      );
    }

    // 既存のアカウントを確認
    const { data: existingAccount } = await supabase
      .from('facility_accounts')
      .select('id')
      .eq('facility_id', facility_id)
      .eq('channel_id', channel_id)
      .eq('account_type', account_type || 'shared')
      .single();

    let accountId: string;

    if (existingAccount) {
      // 既存アカウントを更新
      const { error: updateError } = await supabase
        .from('facility_accounts')
        .update({
          login_id,
          password,
        })
        .eq('id', existingAccount.id);

      if (updateError) {
        console.error('Account update error:', updateError);
        return NextResponse.json(
          { error: 'アカウントの更新に失敗しました' },
          { status: 500 }
        );
      }

      accountId = existingAccount.id;
    } else {
      // 新規アカウントを作成
      const { data: newAccount, error: insertError } = await supabase
        .from('facility_accounts')
        .insert({
          facility_id,
          channel_id,
          account_type: account_type || 'shared',
          login_id,
          password,
        })
        .select('id')
        .single();

      if (insertError || !newAccount) {
        console.error('Account insert error:', insertError);
        return NextResponse.json(
          { error: 'アカウントの作成に失敗しました' },
          { status: 500 }
        );
      }

      accountId = newAccount.id;
    }

    // フィールド値を保存
    if (field_values && Object.keys(field_values).length > 0) {
      // フィールド定義を取得
      const { data: fieldDefs } = await supabase
        .from('account_field_definitions')
        .select('id, field_key')
        .eq('channel_id', channel_id);

      if (fieldDefs) {
        for (const [fieldKey, value] of Object.entries(field_values)) {
          const fieldDef = fieldDefs.find((fd) => fd.field_key === fieldKey);
          if (!fieldDef) continue;

          // 既存の値を確認
          const { data: existingValue } = await supabase
            .from('account_field_values')
            .select('id')
            .eq('facility_account_id', accountId)
            .eq('field_definition_id', fieldDef.id)
            .single();

          if (existingValue) {
            // 更新
            await supabase
              .from('account_field_values')
              .update({ value: value as string })
              .eq('id', existingValue.id);
          } else {
            // 挿入
            await supabase.from('account_field_values').insert({
              facility_account_id: accountId,
              field_definition_id: fieldDef.id,
              value: value as string,
            });
          }
        }
      }
    }

    return NextResponse.json({ success: true, account_id: accountId });
  } catch (error) {
    console.error('Account save error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
