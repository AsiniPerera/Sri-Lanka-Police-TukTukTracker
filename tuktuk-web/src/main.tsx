import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AsgardeoProvider } from '@asgardeo/react';
import App from './App';
import { asgardeoConfig } from './auth/config';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AsgardeoProvider {...asgardeoConfig}>
      <App />
    </AsgardeoProvider>
  </StrictMode>,
);
