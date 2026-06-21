import React, { useState, useEffect } from 'react';
import api from './api';
import DocumentLibrary from './components/Library/DocumentLibrary';
import SplitPaneEditor from './components/Editor/SplitPaneEditor';
import FolderImporter from './components/Importer/FolderImporter';
import ErrorBanner from './components/ErrorBanner';

export default function App() {
  const [projects, setProjects] = useState([]);
  const [activeProject, setActiveProject] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [view, setView] = useState('library');
  const [backendStatus, setBackendStatus] = useState(null);

  useEffect(() => {
    checkBackend();
    loadProjects();
  }, []);

  const checkBackend = async () => {
    try {
      const res = await api.get('/api/status');
      setBackendStatus(res.data);
    } catch (err) {
      setBackendStatus({ error: 'Backend offline' });
    }
  };

  const loadProjects = async () => {
    try {
      const res = await api.get('/api/projects');
      setProjects(res.data);
    } catch (err) {
      console.error('Failed to load projects:', err);
    }
  };

  /**
   * Called after OCR is complete (either via Import Folder or Upload Images).
   * Accepts either:
   *   - A string (folder_path) -> then calls /api/import
   *   - An object (project) -> uses directly
   */
  const handleImportComplete = async (result) => {
    setLoading(true);
    setError(null);
    try {
      let project;

      if (typeof result === 'string') {
        // Folder path was provided - call import endpoint
        const res = await api.post('/api/import', { folder_path: result });
        project = res.data;
      } else if (result && result.id) {
        // Project object was returned directly (from upload endpoint)
        project = result;
      } else {
        throw new Error('Invalid import result');
      }

      setProjects((prev) => {
        const exists = prev.find((p) => p.id === project.id);
        return exists ? prev.map((p) => (p.id === project.id ? project : p)) : [...prev, project];
      });
      setActiveProject(project);
      setView('editor');
    } catch (err) {
      setError(err.friendlyMessage || err.response?.data?.detail || 'Import failed: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectProject = (project) => {
    setActiveProject(project);
    setView('editor');
  };

  const handleSave = async () => {
    if (!activeProject) return;
    setLoading(true);
    try {
      const res = await api.post('/api/save', {
        docx_path: activeProject.docx_path,
        content: activeProject.content,
      });
      setActiveProject({ ...activeProject, ...res.data });
    } catch (err) {
      setError(err.friendlyMessage || err.response?.data?.detail || 'Save failed');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveTranslation = async (translatedContent, lang) => {
    if (!activeProject) return;
    setLoading(true);
    try {
      const res = await api.post('/api/save-translation', {
        docx_path: activeProject.docx_path,
        content: translatedContent,
        target_lang: lang,
      });
      setActiveProject({ ...activeProject, ...res.data });
    } catch (err) {
      setError(err.friendlyMessage || err.response?.data?.detail || 'Save translation failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-screen flex flex-col">
      <header className="bg-slate-800 text-white px-6 py-3 flex items-center justify-between shadow-md">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold">Translation Tool</h1>
          <button
            onClick={() => setView('library')}
            className={`px-3 py-1 rounded text-sm ${view === 'library' ? 'bg-slate-600' : 'hover:bg-slate-700'}`}
          >
            Library
          </button>
        </div>
        <div className="flex items-center gap-3">
          {backendStatus && !backendStatus.error && backendStatus.tesseract === false && (
            <span className="text-amber-300 text-xs px-2 py-1 bg-amber-800 rounded">
              Installing Tesseract... (first run only)
            </span>
          )}
          {backendStatus && backendStatus.error && (
            <span className="text-red-300 text-xs px-2 py-1 bg-red-800 rounded">
              Backend offline
            </span>
          )}
          {activeProject && (
            <button onClick={handleSave} disabled={loading}
              className="bg-emerald-600 hover:bg-emerald-700 px-4 py-1.5 rounded text-sm disabled:opacity-50">
              {loading ? 'Saving...' : 'Save'}
            </button>
          )}
          <FolderImporter onImport={handleImportComplete} disabled={loading} />
        </div>
      </header>

      <ErrorBanner error={error} onDismiss={() => setError(null)} />

      <main className="flex-1 overflow-hidden">
        {view === 'library' && (
          <DocumentLibrary projects={projects} onSelect={handleSelectProject} onRefresh={loadProjects} />
        )}
        {view === 'editor' && activeProject ? (
          <SplitPaneEditor
            project={activeProject}
            onSave={handleSave}
            onSaveTranslation={handleSaveTranslation}
            loading={loading}
          />
        ) : view === 'editor' && !activeProject ? (
          <div className="h-full flex items-center justify-center text-gray-500">
            <p>Select a document from the Library to start editing.</p>
          </div>
        ) : null}
      </main>
    </div>
  );
}
