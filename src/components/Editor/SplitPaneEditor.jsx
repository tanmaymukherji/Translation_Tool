import React, { useState, useEffect, useCallback } from 'react';
import { translate } from '../../translation';
import { generateDocx } from '../../docx';
import CONFIG from '../../config';

function parseParagraphs(project) {
  const html = project?.content || '';
  const div = document.createElement('div');
  div.innerHTML = html;
  const paraElements = div.querySelectorAll('p');
  const result = [];
  let index = 0;

  if (paraElements.length > 0) {
    paraElements.forEach((p) => {
      const text = p.innerText.trim();
      if (text) {
        result.push({
          id: `p_${index}`,
          index,
          page: parseInt(p.getAttribute('data-page'), 10) || 1,
          text,
        });
        index++;
      }
    });
  } else {
    const lines = html.split(/\n\s*\n/);
    lines.forEach((line) => {
      const text = line.replace(/<[^>]*>/g, '').trim();
      if (text) {
        result.push({ id: `p_${index}`, index, page: 1, text });
        index++;
      }
    });
  }

  if (result.length === 0 && project?.paragraphs) {
    for (const p of project.paragraphs) {
      result.push({
        id: p.id || `p_${index}`,
        index,
        page: p.page || 1,
        text: p.text,
      });
      index++;
    }
  }

  return result;
}

export default function SplitPaneEditor({ project, onSave, loading }) {
  const [paragraphs, setParagraphs] = useState([]);
  const [originals, setOriginals] = useState({});
  const [translations, setTranslations] = useState({});
  const [translatingIndex, setTranslatingIndex] = useState(null);
  const [targetLang, setTargetLang] = useState(
    () => localStorage.getItem('target_lang') || 'bn'
  );
  const [provider, setProvider] = useState(
    () => localStorage.getItem('translation_provider') || 'huggingface'
  );
  const [apiKey, setApiKey] = useState(
    () => localStorage.getItem('hf_api_key') || ''
  );
  const [error, setError] = useState(null);

  useEffect(() => {
    if (project) {
      const parsed = parseParagraphs(project);
      setParagraphs(parsed);
      const origs = {};
      for (const p of parsed) {
        origs[p.index] = p.text;
      }
      setOriginals(origs);

      if (project.translations) {
        setTranslations(project.translations);
      }
    }
  }, [project]);

  const updateOriginal = useCallback((index, text) => {
    setOriginals((prev) => ({ ...prev, [index]: text }));
  }, []);

  const updateTranslation = useCallback((index, text) => {
    setTranslations((prev) => ({ ...prev, [index]: text }));
  }, []);

  const handleTranslate = useCallback(async (para) => {
    const text = originals[para.index] || para.text;
    setTranslatingIndex(para.index);
    setError(null);

    try {
      const result = await translate(provider, text, 'auto', targetLang, apiKey);
      setTranslations((prev) => ({
        ...prev,
        [para.index]: result.translation,
      }));
    } catch (err) {
      console.error('Translation failed:', err);
      setError(err.message || 'Translation failed');
    } finally {
      setTranslatingIndex(null);
    }
  }, [provider, targetLang, apiKey, originals]);

  const handleKeepOriginal = useCallback((para) => {
    setTranslations((prev) => ({
      ...prev,
      [para.index]: originals[para.index] || para.text,
    }));
  }, [originals]);

  const handleExportDocx = async () => {
    const allParagraphs = paragraphs.map((p) => {
      return translations[p.index] || originals[p.index] || p.text;
    });
    try {
      const filename = `${project.name || 'translation'}_${targetLang}.docx`;
      await generateDocx(allParagraphs, filename);
    } catch (err) {
      setError('Export failed: ' + err.message);
    }
  };

  const handleSave = () => {
    const html = paragraphs
      .map((p) => `<p data-page="${p.page}">${originals[p.index] || p.text}</p>`)
      .join('\n');
    const saveData = {
      translations,
      total_paragraphs: paragraphs.length,
    };
    onSave(html, saveData);
  };

  const handleProviderChange = (newProvider) => {
    setProvider(newProvider);
    localStorage.setItem('translation_provider', newProvider);
  };

  const handleLangChange = (newLang) => {
    setTargetLang(newLang);
    localStorage.setItem('target_lang', newLang);
  };

  let lastPage = 0;

  return (
    <div className="h-full flex">
      <div className="w-1/2 border-r border-gray-300 flex flex-col">
        <div className="bg-gray-100 px-4 py-2 border-b border-gray-300 text-sm font-medium text-gray-700 flex items-center justify-between">
          <span>Original Document</span>
          <span className="text-xs text-gray-500">{paragraphs.length} paragraphs</span>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {paragraphs.map((p, i) => {
            const showPageBreak = p.page !== lastPage && i > 0;
            lastPage = p.page;
            return (
              <div key={p.id || i} className="mb-3">
                {showPageBreak && (
                  <div className="flex items-center gap-2 mb-2 text-xs text-gray-400">
                    <span className="border-t border-gray-300 flex-1" />
                    Page {p.page}
                    <span className="border-t border-gray-300 flex-1" />
                  </div>
                )}
                <div className="group relative">
                  <div className="flex items-center gap-1 mb-1">
                    <span className="text-xs text-gray-400 font-mono">¶{i + 1}</span>
                    {p.page > 0 && (
                      <span className="text-xs text-gray-400">p.{p.page}</span>
                    )}
                  </div>
                  <textarea
                    value={originals[p.index] !== undefined ? originals[p.index] : p.text}
                    onChange={(e) => updateOriginal(p.index, e.target.value)}
                    className="w-full p-3 bg-white rounded border border-gray-200 focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 text-sm resize-y min-h-[3rem] font-sans leading-relaxed"
                    rows={Math.max(2, ((originals[p.index] || p.text).length / 60) + 1)}
                  />
                  <div className="mt-1 flex gap-1">
                    <button
                      onClick={() => handleTranslate(p)}
                      disabled={translatingIndex === p.index}
                      className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded hover:bg-indigo-200 disabled:opacity-50"
                    >
                      {translatingIndex === p.index ? 'Translating...' : 'Translate'}
                    </button>
                    <button
                      onClick={() => handleKeepOriginal(p)}
                      className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded hover:bg-gray-200"
                    >
                      Keep Original
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="w-1/2 flex flex-col">
        <div className="bg-gray-100 px-4 py-2 border-b border-gray-300">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">Translation</span>
            <div className="flex items-center gap-2">
              <select
                value={targetLang}
                onChange={(e) => handleLangChange(e.target.value)}
                className="text-xs border rounded px-2 py-1"
              >
                {CONFIG.LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.name} ({l.native})
                  </option>
                ))}
              </select>
              <select
                value={provider}
                onChange={(e) => handleProviderChange(e.target.value)}
                className="text-xs border rounded px-2 py-1"
              >
                <option value="huggingface">Hugging Face (IndicTrans2)</option>
                <option value="bhashini">Bhashini</option>
              </select>
              <button
                onClick={handleExportDocx}
                className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs px-3 py-1 rounded"
              >
                Export DOCX
              </button>
              <button
                onClick={handleSave}
                disabled={loading}
                className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs px-3 py-1 rounded disabled:opacity-50"
              >
                {loading ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-red-100 border-l-4 border-red-500 text-red-700 px-4 py-2 text-sm">
            {error}
            <button onClick={() => setError(null)} className="float-right font-bold">&times;</button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4">
          {Object.keys(translations).length > 0 ? (
            paragraphs.map((p, i) => {
              const t = translations[p.index];
              return t !== undefined ? (
                <div key={p.id || i} className="mb-3">
                  <div className="flex items-center gap-1 mb-1">
                    <span className="text-xs text-gray-400 font-mono">¶{i + 1}</span>
                    {p.page > 0 && (
                      <span className="text-xs text-gray-400">p.{p.page}</span>
                    )}
                  </div>
                  <textarea
                    value={t}
                    onChange={(e) => updateTranslation(p.index, e.target.value)}
                    className="w-full p-3 bg-white rounded border border-green-200 focus:border-green-400 focus:ring-1 focus:ring-green-400 text-sm resize-y min-h-[3rem] font-sans leading-relaxed"
                    rows={Math.max(2, (t.length / 60) + 1)}
                  />
                </div>
              ) : null;
            })
          ) : (
            <div className="text-center text-gray-400 mt-20">
              <p className="text-lg">No translations yet.</p>
              <p className="text-sm mt-2">
                Click "Translate" on any paragraph to get started.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
