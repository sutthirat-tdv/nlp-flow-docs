import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export interface RepoConfig {
	id: string;
	name: string;
	title: string;
	role: 'entrypoint' | 'aggregator' | 'domain';
	layer: number;
	summary: string;
	audience: string;
	localPath: string;
	branch: string;
	github: string;
	apiPrefix: string;
	apiPrefixExcludes?: string[];
	topicEnumFiles: string[];
	domainRoots: string[];
}

export interface DownstreamSystemConfig {
	title: string;
	kind: string;
	description: string;
}

export interface DocsConfig {
	defaultBranch: string;
	cacheDir: string;
	outDir: string;
	repos: RepoConfig[];
	downstreamSystems: Record<string, DownstreamSystemConfig>;
}

export function loadConfig(): DocsConfig {
	const raw = readFileSync(resolve(projectRoot, 'repos.config.json'), 'utf8');
	return JSON.parse(raw) as DocsConfig;
}

export function repoSourcePath(repo: RepoConfig): string {
	return resolve(projectRoot, repo.localPath);
}

export function snapshotPath(config: DocsConfig, repo: RepoConfig): string {
	return resolve(projectRoot, config.cacheDir, repo.id);
}
