import React, { useRef } from 'react';
import api from '../../api';

export default function FolderImporter({ onImport, disabled }) {
  const fileInputRef = useRef(null);

  const handleFolderClick = async () => {
    if (window.electronAPI && window.electronAPI.selectFolder) {
      const folder = await window.electronAPI.selectFolder();
      if (folder) onImport(folder);
      return;
    }
    // Fallback: prompt for path (only works when backend runs on same machine)
    const folder = prompt('Enter full folder path containing scanned images:');
    if (folder) onImport(folder);
  };

  const handleFileSelect = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    const formData = new FormData();
    files.forEach((file) => formData.append('images', file));

    try {
      // Do NOT set Content-Type header - axios auto-sets it with boundary for FormData
      const res = await api.post('/api/upload', formData);
      // Upload endpoint returns the project directly - pass to onImport
      onImport(res.data);
    } catch (err) {
      const message = err.friendlyMessage || err.response?.data?.detail || err.message;
      alert('Upload failed:\n\n' + message);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handleFolderClick}
        disabled={disabled}
        className="bg-indigo-600 hover:bg-indigo-700 px-4 py-1.5 rounded text-sm disabled:opacity-50"
      >
        {disabled ? 'Importing...' : '+ Import Folder'}
      </button>
      <span className="text-xs text-gray-400">or</span>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/png,image/jpeg,image/tiff"
        onChange={handleFileSelect}
        className="hidden"
      />
      <button
        onClick={() => fileInputRef.current?.click()}
        disabled={disabled}
        className="bg-emerald-600 hover:bg-emerald-700 px-4 py-1.5 rounded text-sm disabled:opacity-50"
      >
        Upload Images
      </button>
    </div>
  );
}
