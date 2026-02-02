'use client';

import { useState } from 'react';

/**
 * E2Eテスト用のモックログインページ
 * 実際のOTAサイトを模倣した構造
 */
export default function MockLoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // テスト用の検証ロジック
    if (username === 'test_user' && password === 'test_password') {
      setStatus('success');
      setErrorMessage('');
    } else {
      setStatus('error');
      setErrorMessage('ログインIDまたはパスワードが正しくありません');
    }
  };

  if (status === 'success') {
    return (
      <div className="min-h-screen bg-gray-100 p-8">
        <div className="max-w-md mx-auto bg-white rounded-lg shadow p-6">
          <div
            id="mock-dashboard"
            className="dashboard-header"
            data-testid="login-success"
          >
            <h1 className="text-xl font-bold text-green-600 mb-4">
              ログイン成功
            </h1>
            <p>ようこそ、{username}さん</p>
            <p className="text-sm text-gray-500 mt-2">
              これはE2Eテスト用のモックダッシュボードです
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-md mx-auto bg-white rounded-lg shadow p-6">
        <h1 className="text-xl font-bold mb-6">モックOTAログイン</h1>
        <p className="text-sm text-gray-500 mb-4">
          E2Eテスト用のモックログインページです
        </p>

        {status === 'error' && (
          <div
            className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4"
            data-testid="login-error"
          >
            {errorMessage}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label
              htmlFor="username"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              ログインID
            </label>
            <input
              id="username"
              name="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
              data-testid="username-input"
            />
          </div>

          <div className="mb-6">
            <label
              htmlFor="password"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              パスワード
            </label>
            <input
              id="password"
              name="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
              data-testid="password-input"
            />
          </div>

          <button
            type="submit"
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700"
            id="login-button"
            data-testid="submit-button"
          >
            ログイン
          </button>
        </form>

        <div className="mt-6 p-4 bg-gray-50 rounded text-xs text-gray-500">
          <p className="font-bold mb-1">テスト用認証情報:</p>
          <p>ID: test_user</p>
          <p>PW: test_password</p>
        </div>
      </div>
    </div>
  );
}
