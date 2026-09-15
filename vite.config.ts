import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
	// Relative base so the built site works from any folder, a sub path on an
	// internal web server, or straight off a file share.
	base: './',
	plugins: [react()],
	server: { port: 4173, open: false },
	build: {
		outDir: 'dist',
		chunkSizeWarningLimit: 2000,
		rollupOptions: {
			output: {
				manualChunks: {
					mermaid: ['mermaid'],
					search: ['minisearch'],
				},
			},
		},
	},
});
