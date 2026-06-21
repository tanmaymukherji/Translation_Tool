import React, { useState, useRef, useCallback, useEffect } from 'react';

const SUGGESTION_API = 'https://api.mymemory.translated.net/get';

function getWordAtPos(text, cursorPos) {
  const before = text.slice(0, cursorPos);
  const after = text.slice(cursorPos);
  const wordStart = Math.max(0, before.search(/\S*$/) + before.slice(0, before.search(/\S*$/)).length);
  const afterMatch = after.match(/^[\w\u0900-\u097F\u0980-\u09FF\u0A00-\u0A7F\u0A80-\u0AFF\u0B00-\u0B7F\u0B80-\u0BFF\u0C00-\u0C7F\u0C80-\u0CFF\u0D00-\u0D7F]+/);
  const wordEnd = cursorPos + (afterMatch ? afterMatch[0].length : 0);
  const word = text.slice(wordStart, wordEnd);
  const beforeChar = wordStart > 0 ? text[wordStart - 1] : ' ';
  return { word, start: wordStart, end: wordEnd, isWord: /[\w\u0900-\u097F\u0980-\u09FF]/.test(word) && beforeChar === ' ' };
}

async function fetchSuggestions(word) {
  try {
    const lang = /[\u0900-\u097F\u0980-\u09FF]/.test(word) ? 'hi' : 'en';
    // Try MyMemory for similar translations
    const url = `${SUGGESTION_API}?q=${encodeURIComponent(word)}&langpair=${lang}|${lang}&mt=0&num=5`;
    const res = await fetch(url);
    const data = await res.json();
    const matches = data?.matches || [];
    const suggestions = matches
      .map((m) => m.segment || '')
      .filter((s) => s && s.toLowerCase() !== word.toLowerCase())
      .slice(0, 5);
    // Deduplicate
    return [...new Set(suggestions)];
  } catch {
    return [];
  }
}

export default function SmartTextarea({ value, onChange, className, rows, placeholder, disabled }) {
  const textareaRef = useRef(null);
  const [menuPos, setMenuPos] = useState(null);
  const [selectedWord, setSelectedWord] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);

  useEffect(() => {
    if (showSuggestions && selectedWord) {
      setLoading(true);
      fetchSuggestions(selectedWord).then((result) => {
        setSuggestions(result);
        setLoading(false);
      });
    }
  }, [showSuggestions, selectedWord]);

  const handleContextMenu = useCallback((e) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const cursorPos = textarea.selectionStart;
    const { word, start, end, isWord } = getWordAtPos(value, cursorPos);
    if (isWord && word.length > 1) {
      e.preventDefault();
      setSelectedWord(word);
      setMenuPos({ x: e.clientX, y: e.clientY });
      setSuggestions([]);
      setShowSuggestions(false);
    }
  }, [value]);

  const handleSuggest = useCallback(() => {
    setShowSuggestions(true);
  }, []);

  const handleReplace = useCallback((replacement) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const { start, end } = getWordAtPos(value, textarea.selectionStart || 0);
    const newValue = value.slice(0, start) + replacement + value.slice(end);
    onChange(newValue);
    setMenuPos(null);
    setShowSuggestions(false);
  }, [value, onChange]);

  const closeMenu = useCallback(() => {
    setMenuPos(null);
    setShowSuggestions(false);
  }, []);

  useEffect(() => {
    if (menuPos) {
      const handler = (e) => {
        if (e.target.closest('.spell-menu') || e.target.closest('.spell-suggestions')) return;
        closeMenu();
      };
      document.addEventListener('mousedown', handler);
      return () => document.removeEventListener('mousedown', handler);
    }
  }, [menuPos, closeMenu]);

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={className}
        rows={rows}
        placeholder={placeholder}
        disabled={disabled}
        spellCheck={true}
        lang="hi"
        onContextMenu={handleContextMenu}
      />
      {menuPos && (
        <div
          className="spell-menu fixed z-50 bg-white border border-gray-200 rounded shadow-lg py-1 min-w-[160px]"
          style={{ left: menuPos.x, top: menuPos.y }}
        >
          <div className="px-3 py-1.5 text-xs text-gray-500 border-b border-gray-100 truncate max-w-[200px]">
            &ldquo;{selectedWord}&rdquo;
          </div>
          <button
            onClick={handleSuggest}
            className="w-full text-left px-3 py-1.5 text-sm hover:bg-indigo-50 text-gray-700"
          >
            {loading ? 'Loading...' : 'Suggest correction'}
          </button>
          {showSuggestions && (
            <div className="spell-suggestions border-t border-gray-100">
              {suggestions.length === 0 && !loading && (
                <div className="px-3 py-1.5 text-xs text-gray-400">No suggestions found</div>
              )}
              {suggestions.map((s, i) => (
                <button
                  key={i}
                  onClick={() => handleReplace(s)}
                  className="w-full text-left px-3 py-1 text-sm hover:bg-green-50 text-gray-700 font-medium"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
