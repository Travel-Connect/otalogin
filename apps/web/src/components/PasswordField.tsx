'use client';

import { useState, useEffect, useCallback } from 'react';

interface PasswordFieldProps {
  value: string;
  onReveal?: () => Promise<string>; // 実際のパスワードを取得するコールバック
}

export function PasswordField({ value: _value, onReveal }: PasswordFieldProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [displayValue, setDisplayValue] = useState('••••••••');

  // 10秒で自動マスク復帰
  useEffect(() => {
    if (isVisible) {
      const timer = setTimeout(() => {
        setIsVisible(false);
        setDisplayValue('••••••••');
      }, 10000);
      return () => clearTimeout(timer);
    }
  }, [isVisible]);

  const handleToggle = useCallback(async () => {
    if (!isVisible && onReveal) {
      try {
        const password = await onReveal();
        setDisplayValue(password);
        setIsVisible(true);
      } catch {
        // エラー時は何もしない
      }
    } else {
      setIsVisible(false);
      setDisplayValue('••••••••');
    }
  }, [isVisible, onReveal]);

  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-sm">
        {isVisible ? displayValue : '••••••••'}
      </span>
      <button
        type="button"
        onClick={handleToggle}
        className="text-gray-400 hover:text-gray-600 transition-colors"
        aria-label={isVisible ? 'パスワードを隠す' : 'パスワードを表示'}
      >
        {isVisible ? (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
            />
          </svg>
        ) : (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
            />
          </svg>
        )}
      </button>
    </div>
  );
}
