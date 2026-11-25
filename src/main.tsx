import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/figtree';
import './styles/tokens.css';
import './styles/base.css';
import App from './App';
import { ensureSeeded } from './data/seed';
import { db } from './data/db';
import { startSyncLoop } from './data/sync';

async function start() {
  // Ask the browser to keep our data even when storage runs low.
  try {
    await navigator.storage?.persist?.();
  } catch {
    /* not supported; data is still saved */
  }
  await ensureSeeded();
  startSyncLoop();
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

start().catch((err) => {
  console.error(err);
  db.close();
  document.getElementById('root')!.textContent = 'Neatly could not open its storage. Please reload the app.';
});
