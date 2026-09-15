/**
 * Step 1 of the pipeline.
 *
 * Takes a read-only snapshot of every configured repository at its documented
 * branch (origin/sit by default) and writes it under .cache/snapshots/<repoId>.
 *
 * Nothing here ever touches the developer's working tree: we read the branch
 * straight out of the object database with `git archive`, so whatever branch you
 * happen to have checked out, or however dirty your worktree is, the docs always
 * describe the branch named in repos.config.json.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
	DocsConfig,
	RepoConfig,
	loadConfig,
	projectRoot,
	repoSourcePath,
	snapshotPath,
} from './config.js';

const SNAPSHOT_PATHS = [
	'src',
	'package.json',
	'example.env',
	'assets/config',
	'scripts',
	'README.md',
	'Dockerfile',
	'.tool-versions',
];

export interface RepoCommit {
	sha: string;
	shortSha: string;
	date: string;
	author: string;
	subject: string;
}

export interface RepoProvenance {
	repoId: string;
	name: string;
	branch: string;
	commit: RepoCommit;
	latestTag: string | null;
	describe: string | null;
	recentTags: { tag: string; date: string; sha: string }[];
	packageVersion: string | null;
	nodeVersion: string | null;
	/** Commits added since the previous documentation build, newest first. */
	newCommitsSinceLastBuild: RepoCommit[];
	previousBuildCommit: string | null;
	fetched: boolean;
}

export interface Manifest {
	generatedAt: string;
	generatorVersion: string;
	repos: RepoProvenance[];
}

function git(cwd: string, args: string[]): string {
	return execFileSync('git', args, {
		cwd,
		encoding: 'utf8',
		maxBuffer: 256 * 1024 * 1024,
		// execFileSync forwards the child's stderr to ours by default, which makes
		// the expected "path not in tree" probes look like real failures.
		stdio: ['ignore', 'pipe', 'pipe'],
	}).trim();
}

function gitSafe(cwd: string, args: string[]): string | null {
	try {
		return git(cwd, args);
	} catch {
		return null;
	}
}

function readPreviousManifest(config: DocsConfig): Manifest | null {
	const file = resolve(projectRoot, config.outDir, 'manifest.json');
	if (!existsSync(file)) return null;
	try {
		return JSON.parse(readFileSync(file, 'utf8')) as Manifest;
	} catch {
		return null;
	}
}

function parseCommit(line: string): RepoCommit {
	const [sha, shortSha, date, author, ...subject] = line.split('\u001f');
	return { sha, shortSha, date, author, subject: subject.join('\u001f') };
}

const COMMIT_FORMAT = '%H%x1f%h%x1f%cI%x1f%an%x1f%s';

function fetchBranch(repoPath: string, branch: string): boolean {
	// `origin/sit` -> remote `origin`, ref `sit`
	const match = /^([^/]+)\/(.+)$/.exec(branch);
	if (!match) return false;
	const [, remote, ref] = match;
	try {
		execFileSync('git', ['fetch', '--tags', '--quiet', remote, ref], {
			cwd: repoPath,
			stdio: 'ignore',
			timeout: 120_000,
		});
		return true;
	} catch {
		return false;
	}
}

function snapshotRepo(
	config: DocsConfig,
	repo: RepoConfig,
	previous: Manifest | null,
	options: { fetch: boolean },
): RepoProvenance {
	const repoPath = repoSourcePath(repo);
	if (!existsSync(repoPath)) {
		throw new Error(
			`Repository ${repo.name} is not checked out at ${repoPath}. ` +
				`Clone it or fix "localPath" in repos.config.json.`,
		);
	}

	const branch = repo.branch || config.defaultBranch;
	let fetched = false;
	if (options.fetch) {
		process.stdout.write(`  fetching ${branch}... `);
		fetched = fetchBranch(repoPath, branch);
		process.stdout.write(fetched ? 'ok\n' : 'skipped (offline or no access)\n');
	}

	if (!gitSafe(repoPath, ['rev-parse', '--verify', `${branch}^{commit}`])) {
		throw new Error(`Branch ${branch} does not exist in ${repo.name}.`);
	}

	const commit = parseCommit(git(repoPath, ['log', '-1', `--format=${COMMIT_FORMAT}`, branch]));

	const target = snapshotPath(config, repo);
	rmSync(target, { recursive: true, force: true });
	mkdirSync(target, { recursive: true });

	const existingPaths = SNAPSHOT_PATHS.filter(
		p => gitSafe(repoPath, ['cat-file', '-e', `${branch}:${p}`]) !== null,
	);
	const archive = execFileSync('git', ['archive', '--format=tar', branch, ...existingPaths], {
		cwd: repoPath,
		maxBuffer: 1024 * 1024 * 1024,
	});
	execFileSync('tar', ['-x', '-C', target], { input: archive, maxBuffer: 1024 * 1024 * 1024 });

	let packageVersion: string | null = null;
	const pkgFile = resolve(target, 'package.json');
	if (existsSync(pkgFile)) {
		try {
			packageVersion = JSON.parse(readFileSync(pkgFile, 'utf8')).version ?? null;
		} catch {
			packageVersion = null;
		}
	}

	let nodeVersion: string | null = null;
	const toolVersions = resolve(target, '.tool-versions');
	if (existsSync(toolVersions)) {
		const m = /nodejs\s+(\S+)/.exec(readFileSync(toolVersions, 'utf8'));
		nodeVersion = m ? m[1] : null;
	}

	const tagLines =
		gitSafe(repoPath, [
			'for-each-ref',
			'--sort=-creatordate',
			'--count=12',
			'--format=%(refname:short)\u001f%(creatordate:short)\u001f%(objectname:short)',
			'refs/tags',
		]) ?? '';
	const recentTags = tagLines
		.split('\n')
		.filter(Boolean)
		.map(line => {
			const [tag, date, sha] = line.split('\u001f');
			return { tag, date, sha };
		});

	const previousEntry = previous?.repos.find(r => r.repoId === repo.id) ?? null;
	const previousBuildCommit = previousEntry?.commit.sha ?? null;
	let newCommitsSinceLastBuild: RepoCommit[] = [];
	if (previousBuildCommit && previousBuildCommit !== commit.sha) {
		const log = gitSafe(repoPath, [
			'log',
			`--format=${COMMIT_FORMAT}`,
			'--max-count=200',
			`${previousBuildCommit}..${commit.sha}`,
		]);
		if (log) newCommitsSinceLastBuild = log.split('\n').filter(Boolean).map(parseCommit);
	}

	return {
		repoId: repo.id,
		name: repo.name,
		branch,
		commit,
		latestTag: gitSafe(repoPath, ['describe', '--tags', '--abbrev=0', branch]),
		describe: gitSafe(repoPath, ['describe', '--tags', branch]),
		recentTags,
		packageVersion,
		nodeVersion,
		newCommitsSinceLastBuild,
		previousBuildCommit,
		fetched,
	};
}

export function sync(options: { fetch: boolean }): Manifest {
	const config = loadConfig();
	const previous = readPreviousManifest(config);
	const repos: RepoProvenance[] = [];

	for (const repo of config.repos) {
		console.log(`- ${repo.name}`);
		const provenance = snapshotRepo(config, repo, previous, options);
		const tag = provenance.latestTag ? ` (latest tag ${provenance.latestTag})` : '';
		console.log(
			`  ${provenance.branch} @ ${provenance.commit.shortSha} ${provenance.commit.date.slice(0, 10)}${tag}`,
		);
		if (provenance.newCommitsSinceLastBuild.length) {
			console.log(
				`  ${provenance.newCommitsSinceLastBuild.length} new commit(s) since the last docs build`,
			);
		}
		repos.push(provenance);
	}

	const manifest: Manifest = {
		generatedAt: new Date().toISOString(),
		generatorVersion: '1.0.0',
		repos,
	};

	const cacheRoot = resolve(projectRoot, config.cacheDir);
	mkdirSync(cacheRoot, { recursive: true });
	writeFileSync(resolve(cacheRoot, 'manifest.json'), JSON.stringify(manifest, null, 2));
	return manifest;
}

const invokedDirectly = process.argv[1]?.endsWith('sync.ts') || process.argv[1]?.endsWith('sync.js');
if (invokedDirectly) {
	const noFetch = process.argv.includes('--no-fetch');
	console.log(`Snapshotting repositories${noFetch ? ' (offline)' : ''}...`);
	sync({ fetch: !noFetch });
	console.log('Snapshots ready.');
}
