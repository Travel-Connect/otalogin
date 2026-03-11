'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import type { ShortcutWithDetails } from '@/lib/supabase/types';

interface Props {
  facilities: Array<{ id: string; name: string; code: string }>;
  channels: Array<{ id: string; name: string; code: string }>;
}

type SortKey = 'name' | 'facility' | 'channel' | 'action' | 'created';

export function ShortcutManager({ facilities, channels }: Props) {
  const [shortcuts, setShortcuts] = useState<ShortcutWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('created');
  const [sortAsc, setSortAsc] = useState(false);

  // 作成フォーム
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    facility_id: '',
    channel_id: '',
    action_type: 'login' as 'login' | 'public',
    slot_no: null as number | null,
  });
  const [saving, setSaving] = useState(false);

  // 編集中
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    name: '',
    action_type: 'login' as 'login' | 'public',
    slot_no: null as number | null,
  });

  // コピー成功表示
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const fetchShortcuts = useCallback(async () => {
    try {
      const res = await fetch('/api/shortcuts');
      if (!res.ok) throw new Error('取得に失敗しました');
      const data = await res.json();
      setShortcuts(data.shortcuts || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : '取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchShortcuts();
  }, [fetchShortcuts]);

  const buildUrl = (shortcut: ShortcutWithDetails): string => {
    const base = `${window.location.origin}/facility/${shortcut.facility_id}?channel=${shortcut.channel_code}`;
    if (shortcut.action_type === 'login') return `${base}&run=1`;
    if (shortcut.action_type === 'public') return `${base}&open=public`;
    return base;
  };

  const handleCopyUrl = async (shortcut: ShortcutWithDetails) => {
    const url = buildUrl(shortcut);
    await navigator.clipboard.writeText(url);
    setCopiedId(shortcut.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleCreate = async () => {
    if (!formData.name.trim() || !formData.facility_id || !formData.channel_id) return;
    setSaving(true);
    setError(null);

    try {
      const res = await fetch('/api/shortcuts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '作成に失敗しました');
      }
      setShowForm(false);
      setFormData({ name: '', facility_id: '', channel_id: '', action_type: 'login', slot_no: null });
      setSuccess('ショートカットを作成しました');
      await fetchShortcuts();
    } catch (err) {
      setError(err instanceof Error ? err.message : '作成に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async (id: string) => {
    setSaving(true);
    setError(null);

    try {
      const res = await fetch(`/api/shortcuts/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '更新に失敗しました');
      }
      setEditingId(null);
      setSuccess('ショートカットを更新しました');
      await fetchShortcuts();
    } catch (err) {
      setError(err instanceof Error ? err.message : '更新に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleEnabled = async (shortcut: ShortcutWithDetails) => {
    try {
      const res = await fetch(`/api/shortcuts/${shortcut.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !shortcut.enabled }),
      });
      if (!res.ok) throw new Error('更新に失敗しました');
      await fetchShortcuts();
    } catch (err) {
      setError(err instanceof Error ? err.message : '更新に失敗しました');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('このショートカットを削除しますか？')) return;
    try {
      const res = await fetch(`/api/shortcuts/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('削除に失敗しました');
      setSuccess('ショートカットを削除しました');
      await fetchShortcuts();
    } catch (err) {
      setError(err instanceof Error ? err.message : '削除に失敗しました');
    }
  };

  const startEdit = (shortcut: ShortcutWithDetails) => {
    setEditingId(shortcut.id);
    setEditForm({
      name: shortcut.name,
      action_type: shortcut.action_type,
      slot_no: shortcut.slot_no,
    });
    setError(null);
    setSuccess(null);
  };

  // フィルタ & ソート
  const filtered = shortcuts.filter((s) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      s.name.toLowerCase().includes(q) ||
      s.facility_name.toLowerCase().includes(q) ||
      s.channel_name.toLowerCase().includes(q)
    );
  });

  const sorted = [...filtered].sort((a, b) => {
    let cmp = 0;
    switch (sortKey) {
      case 'name': cmp = a.name.localeCompare(b.name, 'ja'); break;
      case 'facility': cmp = a.facility_name.localeCompare(b.facility_name, 'ja'); break;
      case 'channel': cmp = a.channel_name.localeCompare(b.channel_name, 'ja'); break;
      case 'action': cmp = a.action_type.localeCompare(b.action_type); break;
      case 'created': cmp = a.created_at.localeCompare(b.created_at); break;
    }
    return sortAsc ? cmp : -cmp;
  });

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  const sortIcon = (key: SortKey) => {
    if (sortKey !== key) return '';
    return sortAsc ? ' \u25B2' : ' \u25BC';
  };

  return (
    <div className="min-h-screen">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-gray-400 hover:text-gray-600 transition-colors">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <h1 className="text-xl font-bold text-gray-900">ショートカット管理</h1>
          </div>
          <button
            onClick={() => { setShowForm(true); setError(null); setSuccess(null); }}
            className="btn btn-primary text-sm"
          >
            + 新規作成
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-md text-red-700">{error}</div>
        )}
        {success && (
          <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-md text-green-700">{success}</div>
        )}

        {/* StreamDeck案内 */}
        <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-md text-sm text-blue-800">
          <p className="font-medium mb-1">StreamDeck / 外部ツール連携</p>
          <p>各ショートカットの「Copy URL」ボタンでURLをコピーし、StreamDeckの「Open URL」アクションに貼り付けてください。URLにID/PWは含まれません。未ログイン時は自動的にログイン画面へ誘導されます。</p>
        </div>

        {/* 作成フォーム */}
        {showForm && (
          <div className="card mb-6">
            <h3 className="text-sm font-semibold mb-4">新規ショートカット</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  名前 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="input"
                  placeholder="例: 楽天トラベル ログイン"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  施設 <span className="text-red-500">*</span>
                </label>
                <select
                  value={formData.facility_id}
                  onChange={(e) => setFormData({ ...formData, facility_id: e.target.value })}
                  className="input"
                >
                  <option value="">選択してください</option>
                  {facilities.map((f) => (
                    <option key={f.id} value={f.id}>{f.name} ({f.code})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  チャネル <span className="text-red-500">*</span>
                </label>
                <select
                  value={formData.channel_id}
                  onChange={(e) => setFormData({ ...formData, channel_id: e.target.value })}
                  className="input"
                >
                  <option value="">選択してください</option>
                  {channels.map((c) => (
                    <option key={c.id} value={c.id}>{c.name} ({c.code})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">アクション</label>
                <select
                  value={formData.action_type}
                  onChange={(e) => setFormData({ ...formData, action_type: e.target.value as 'login' | 'public' })}
                  className="input"
                >
                  <option value="login">ログイン実行</option>
                  <option value="public">公開ページを開く</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  スロット番号（任意, 1-10）
                </label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={formData.slot_no ?? ''}
                  onChange={(e) => setFormData({
                    ...formData,
                    slot_no: e.target.value ? parseInt(e.target.value, 10) : null,
                  })}
                  className="input"
                  placeholder="未割当"
                />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button
                onClick={handleCreate}
                disabled={saving || !formData.name.trim() || !formData.facility_id || !formData.channel_id}
                className="btn btn-primary text-sm disabled:opacity-50"
              >
                {saving ? '作成中...' : '作成'}
              </button>
              <button
                onClick={() => setShowForm(false)}
                disabled={saving}
                className="btn btn-secondary text-sm disabled:opacity-50"
              >
                キャンセル
              </button>
            </div>
          </div>
        )}

        {/* 検索 */}
        <div className="mb-4">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="名前、施設名、チャネル名で検索..."
            className="input max-w-md"
          />
        </div>

        {/* 一覧テーブル */}
        {loading ? (
          <p className="text-gray-500">読み込み中...</p>
        ) : sorted.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            {search ? '検索条件に一致するショートカットがありません' : 'ショートカットがまだありません。「+ 新規作成」から追加してください。'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th
                    className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:text-gray-700"
                    onClick={() => handleSort('name')}
                  >
                    名前{sortIcon('name')}
                  </th>
                  <th
                    className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:text-gray-700"
                    onClick={() => handleSort('facility')}
                  >
                    施設{sortIcon('facility')}
                  </th>
                  <th
                    className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:text-gray-700"
                    onClick={() => handleSort('channel')}
                  >
                    チャネル{sortIcon('channel')}
                  </th>
                  <th
                    className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:text-gray-700"
                    onClick={() => handleSort('action')}
                  >
                    アクション{sortIcon('action')}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Slot
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    状態
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                    操作
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {sorted.map((shortcut) => (
                  <tr key={shortcut.id} className={!shortcut.enabled ? 'opacity-50' : ''}>
                    {editingId === shortcut.id ? (
                      <>
                        <td className="px-4 py-3">
                          <input
                            type="text"
                            value={editForm.name}
                            onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                            className="input text-sm py-1 px-2"
                          />
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">{shortcut.facility_name}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{shortcut.channel_name}</td>
                        <td className="px-4 py-3">
                          <select
                            value={editForm.action_type}
                            onChange={(e) => setEditForm({ ...editForm, action_type: e.target.value as 'login' | 'public' })}
                            className="input text-sm py-1 px-2"
                          >
                            <option value="login">ログイン</option>
                            <option value="public">公開ページ</option>
                          </select>
                        </td>
                        <td className="px-4 py-3">
                          <input
                            type="number"
                            min={1}
                            max={10}
                            value={editForm.slot_no ?? ''}
                            onChange={(e) => setEditForm({
                              ...editForm,
                              slot_no: e.target.value ? parseInt(e.target.value, 10) : null,
                            })}
                            className="input text-sm py-1 px-2 w-16"
                            placeholder="-"
                          />
                        </td>
                        <td className="px-4 py-3" />
                        <td className="px-4 py-3 text-right">
                          <div className="flex gap-1 justify-end">
                            <button
                              onClick={() => handleUpdate(shortcut.id)}
                              disabled={saving}
                              className="text-xs text-blue-600 hover:text-blue-800 disabled:opacity-50"
                            >
                              保存
                            </button>
                            <button
                              onClick={() => setEditingId(null)}
                              disabled={saving}
                              className="text-xs text-gray-500 hover:text-gray-700"
                            >
                              取消
                            </button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-3 text-sm font-medium text-gray-900">{shortcut.name}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{shortcut.facility_name}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{shortcut.channel_name}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                            shortcut.action_type === 'login'
                              ? 'bg-green-100 text-green-800'
                              : 'bg-blue-100 text-blue-800'
                          }`}>
                            {shortcut.action_type === 'login' ? 'ログイン' : '公開ページ'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500">
                          {shortcut.slot_no ?? '-'}
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => handleToggleEnabled(shortcut)}
                            className={`text-xs px-2 py-0.5 rounded ${
                              shortcut.enabled
                                ? 'bg-green-100 text-green-700'
                                : 'bg-gray-100 text-gray-500'
                            }`}
                          >
                            {shortcut.enabled ? '有効' : '無効'}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex gap-2 justify-end">
                            <button
                              onClick={() => handleCopyUrl(shortcut)}
                              className="text-xs text-blue-600 hover:text-blue-800"
                            >
                              {copiedId === shortcut.id ? 'Copied!' : 'Copy URL'}
                            </button>
                            <button
                              onClick={() => startEdit(shortcut)}
                              className="text-xs text-gray-500 hover:text-gray-700"
                            >
                              編集
                            </button>
                            <button
                              onClick={() => handleDelete(shortcut.id)}
                              className="text-xs text-red-500 hover:text-red-700"
                            >
                              削除
                            </button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
