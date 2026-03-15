// SPDX-License-Identifier: BUSL-1.1

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { DatabaseProvider } from './db/DatabaseProvider';
import './theme/tokens.css';
import './styles/responsive.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element not found. Ensure <div id="root"></div> exists in index.html.');
}

createRoot(rootElement).render(
  <StrictMode>
    <DatabaseProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </DatabaseProvider>
  </StrictMode>,
);
