import axios from 'axios';

/**
 * API configuration.
 * 
 * During development (npm run dev): Vite proxies /api to localhost:8000,
 * so we use relative paths and they work seamlessly.
 * 
 * For production/GitHub Pages: User must either:
 *   a) Run local backend and use the Vite proxy (npm run dev)
 *   b) Configure API_BASE to point to their running backend
 * 
 * Default: empty string (relative paths, Vite proxy handles it)
 */

// Allow overriding via localStorage for advanced users
const STORAGE_KEY = 'translation_tool_api_base';
const stored = localStorage.getItem(STORAGE_KEY);

// Detect if we're on GitHub Pages (no backend proxy)
const isGitHubPages = window.location.hostname.includes('github.io');

if (isGitHubPages && !stored) {
  console.warn(
    'Translation Tool: You are viewing from GitHub Pages. ' +
    'API calls will fail unless you run the backend locally. ' +
    'To connect to a local backend:\n' +
    '  1. Run: cd backend && uvicorn main:app --host 0.0.0.0 --port 8000\n' +
    '  2. Set localStorage item: localStorage.setItem("' + STORAGE_KEY + '", "http://localhost:8000")\n' +
    '  3. Reload this page\n' +
    'Or run the app locally: npm run dev'
  );
}

const API_BASE = stored || '';

const api = axios.create({
  baseURL: API_BASE,
  timeout: 30000,
});

// Add response interceptor for logging
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (!error.response) {
      console.error('API Error (no response - backend offline?):', error.message);
      error.friendlyMessage = 
        'Cannot reach the backend server.\n\n' +
        'Please ensure the backend is running:\n' +
        '  cd backend\n' +
        '  uvicorn main:app --host 0.0.0.0 --port 8000\n\n' +
        'If the backend is running on a different address, set:\n' +
        '  localStorage.setItem("translation_tool_api_base", "http://YOUR_IP:PORT")';
    } else {
      console.error('API Error:', error.response.status, error.response.data);
      error.friendlyMessage = error.response?.data?.detail || error.message;
    }
    return Promise.reject(error);
  }
);

export default api;
