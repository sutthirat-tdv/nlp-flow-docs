import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';

import { App } from './App';
import { AuthGate } from './auth/AuthGate';
import { DataProvider } from './data';
import './styles.css';

createRoot(document.getElementById('root')!).render(
	<StrictMode>
		{/* Hash routing keeps the built assets deployable to any static path or file share —
		    but AuthGate's /api/auth/* calls only exist on a Cloudflare Pages deployment
		    with the functions/ directory wired up. See README.md "Access". */}
		<HashRouter>
			<AuthGate>{() => (
				<DataProvider>
					<App />
				</DataProvider>
			)}</AuthGate>
		</HashRouter>
	</StrictMode>,
);
