import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';

import { App } from './App';
import { AuthGate } from './auth/AuthGate';
import { DataProvider } from './data';
import './styles.css';

createRoot(document.getElementById('root')!).render(
	<StrictMode>
		{/* Hash routing keeps the built assets deployable to any static path or file share.
		    AuthGate has no server dependency — see README.md "Access" for what it does
		    and does not protect. */}
		<HashRouter>
			<AuthGate>{() => (
				<DataProvider>
					<App />
				</DataProvider>
			)}</AuthGate>
		</HashRouter>
	</StrictMode>,
);
