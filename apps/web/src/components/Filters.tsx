'use client';

import { useState, useRef, useEffect } from 'react';

export type StatusFilter = 'error' | 'running' | 'unregistered';

interface FiltersProps {
  allTags: string[];
  selectedTags: string[];
  selectedStatuses: StatusFilter[];
  onTagsChange: (tags: string[]) => void;
  onStatusesChange: (statuses: StatusFilter[]) => void;
  onClear: () => void;
}

const STATUS_OPTIONS: { value: StatusFilter; label: string; activeClass: string }[] = [
  { value: 'error', label: 'エラーのみ', activeClass: 'bg-red-100 text-red-700 border-red-200' },
  { value: 'running', label: '実行中のみ', activeClass: 'bg-blue-100 text-blue-700 border-blue-200' },
  { value: 'unregistered', label: '未登録のみ', activeClass: 'bg-gray-100 text-gray-600 border-gray-200' },
];

export function Filters({
  allTags,
  selectedTags,
  selectedStatuses,
  onTagsChange,
  onStatusesChange,
  onClear,
}: FiltersProps) {
  const [tagDropdownOpen, setTagDropdownOpen] = useState(false);
  const tagRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (tagRef.current && !tagRef.current.contains(e.target as Node)) {
        setTagDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  function toggleTag(tag: string) {
    onTagsChange(
      selectedTags.includes(tag) ? selectedTags.filter((t) => t !== tag) : [...selectedTags, tag],
    );
  }

  function toggleStatus(status: StatusFilter) {
    onStatusesChange(
      selectedStatuses.includes(status)
        ? selectedStatuses.filter((s) => s !== status)
        : [...selectedStatuses, status],
    );
  }

  const hasFilters = selectedTags.length > 0 || selectedStatuses.length > 0;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Tag filter dropdown */}
      {allTags.length > 0 && (
        <div className="relative" ref={tagRef}>
          <button
            onClick={() => setTagDropdownOpen((v) => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm transition-colors
              ${selectedTags.length > 0 ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'}
            `}
          >
            タグ
            {selectedTags.length > 0 && (
              <span className="bg-indigo-500 text-white text-[10px] rounded-full px-1.5 py-px font-medium min-w-[18px] text-center">
                {selectedTags.length}
              </span>
            )}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform ${tagDropdownOpen ? 'rotate-180' : ''}`}>
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>

          {tagDropdownOpen && (
            <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-30 py-1 min-w-[160px]">
              {allTags.map((tag) => (
                <button
                  key={tag}
                  onClick={() => toggleTag(tag)}
                  className={`w-full text-left px-3 py-2 text-sm transition-colors flex items-center gap-2
                    ${selectedTags.includes(tag) ? 'bg-indigo-50 text-indigo-700' : 'text-gray-700 hover:bg-gray-50'}
                  `}
                >
                  <span
                    className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0
                      ${selectedTags.includes(tag) ? 'bg-indigo-500 border-indigo-500' : 'border-gray-300'}
                    `}
                  >
                    {selectedTags.includes(tag) && (
                      <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                        <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
                      </svg>
                    )}
                  </span>
                  {tag}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Selected tag chips */}
      {selectedTags.map((tag) => (
        <span
          key={tag}
          className="flex items-center gap-1 px-2.5 py-1 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-lg text-xs"
        >
          {tag}
          <button onClick={() => toggleTag(tag)} className="hover:text-indigo-900">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </span>
      ))}

      {selectedTags.length > 0 && <div className="h-5 w-px bg-gray-200" />}

      {/* Status chips */}
      {STATUS_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          onClick={() => toggleStatus(opt.value)}
          className={`px-3 py-1.5 rounded-lg border text-xs transition-colors
            ${selectedStatuses.includes(opt.value) ? opt.activeClass : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'}
          `}
        >
          {opt.label}
        </button>
      ))}

      {/* Clear button */}
      {hasFilters && (
        <>
          <div className="h-5 w-px bg-gray-200" />
          <button
            onClick={onClear}
            className="flex items-center gap-1 px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700 transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
            クリア
          </button>
        </>
      )}
    </div>
  );
}
