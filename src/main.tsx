import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';

import { App } from './App';
import { DataProvider } from './data';
import './styles.css';

createRoot(document.getElementById('root')!).render(
	<StrictMode>
		{/* Hash routing keeps the built site deployable to any static path or file share. */}
		<HashRouter>
			<DataProvider>
				<App />
			</DataProvider>
		</HashRouter>
	</StrictMode>,
);
