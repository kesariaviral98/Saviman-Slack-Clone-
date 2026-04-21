// ─────────────────────────────────────────────────────────────────────────────
// SearchModal — full-text search across messages (Ctrl+K).
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import Avatar from '@/components/ui/Avatar';

function useDebounce(value, delay) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

function SearchResult({ result, workspaceId, onClose }) {
  const navigate = useNavigate();

  const handleClick = () => {
    onClose();
    navigate(`/workspaces/${workspaceId}/channels/${result.channelId}?highlight=${result.id}`);
  };

  const preview = result.content.length > 120
    ? result.content.slice(0, 120) + '…'
    : result.content;

  return (
    <button
      onClick={handleClick}
      className="w-full flex items-start gap-3 px-4 py-3 hover:bg-surface-raised transition-colors border-b border-gray-100 last:border-0 text-left"
    >
      <Avatar user={result.author} size="sm" />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 mb-0.5">
          <span className="font-semibold text-gray-900 text-xs">
            {result.author?.displayName}
          </span>
          <span className="text-gray-400 text-xs">
            #{result.channel?.name ?? 'channel'}
          </span>
          <span className="text-gray-300 text-xs ml-auto">
            {new Date(result.createdAt).toLocaleDateString()}
          </span>
        </div>
        <p className="text-sm text-gray-700 leading-snug whitespace-pre-wrap break-words">
          {preview}
        </p>
      </div>
    </button>
  );
}

export default function SearchModal({ workspaceId, isOpen, onClose }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef(null);
  const debouncedQuery = useDebounce(query, 300);

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setResults([]);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Perform search when debounced query changes
  useEffect(() => {
    if (!debouncedQuery.trim() || !workspaceId) {
      setResults([]);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError('');

    api
      .get(`/search?q=${encodeURIComponent(debouncedQuery)}&workspaceId=${workspaceId}&limit=20`)
      .then((data) => {
        if (!cancelled) setResults(data.results ?? []);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message ?? 'Search failed.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [debouncedQuery, workspaceId]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh]">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden="true" />

      {/* Panel */}
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-xl mx-4 overflow-hidden">
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200">
          <svg className="w-5 h-5 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search messages…"
            className="flex-1 text-sm text-gray-800 outline-none placeholder-gray-400 bg-transparent"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="text-gray-400 hover:text-gray-600"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
          <kbd className="hidden sm:inline-block text-[10px] border border-gray-200 rounded px-1.5 py-0.5 text-gray-400 font-mono">
            Esc
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-[60vh] overflow-y-auto scrollable">
          {loading && (
            <p className="text-center text-gray-400 text-sm py-8">Searching…</p>
          )}

          {!loading && error && (
            <p className="text-center text-red-500 text-sm py-8">{error}</p>
          )}

          {!loading && !error && query && results.length === 0 && (
            <p className="text-center text-gray-400 text-sm py-8">
              No results for &ldquo;{query}&rdquo;
            </p>
          )}

          {!loading && !query && (
            <p className="text-center text-gray-400 text-sm py-8">
              Type to search messages in this workspace.
            </p>
          )}

          {results.map((r) => (
            <SearchResult
              key={r.id}
              result={r}
              workspaceId={workspaceId}
              onClose={onClose}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
