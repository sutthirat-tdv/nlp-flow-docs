/**
 * Step 3: stitch the per-repo extractions into end-to-end flows.
 *
 * A flow always starts at the platform boundary - either an HTTP endpoint or a
 * Kafka topic that nobody inside these four repos publishes - and then walks
 * the graph: use case -> topic it publishes -> consumer in another service ->
 * its use case -> ... until it runs out of edges, hits a downstream system, or
 * hits the depth budget.
 */
import { Consumer, Endpoint, Flow, FlowStep, Topic, UseCase } from './model.js';

const MAX_DEPTH = 7;
const MAX_STEPS = 70;

export interface GraphInput {
	endpoints: Endpoint[];
	consumers: Consumer[];
	useCases: UseCase[];
	topics: Topic[];
	repoTitles: Map<string, string>;
	systemTitles: Map<string, string>;
}

interface Walker {
	steps: FlowStep[];
	repos: Set<string>;
	topics: Set<string>;
	systems: Set<string>;
	useCaseIds: Set<string>;
	visitedTopics: Set<string>;
	visitedUseCases: Set<string>;
}

function push(w: Walker, step: Omit<FlowStep, 'depth'> & { depth: number }): number {
	w.steps.push(step);
	if (step.repoId) w.repos.add(step.repoId);
	return w.steps.length - 1;
}

export function buildFlows(input: GraphInput): Flow[] {
	const { endpoints, consumers, useCases, topics } = input;
	const useCaseById = new Map(useCases.map(u => [u.id, u]));
	const consumersByTopic = new Map<string, Consumer[]>();
	for (const c of consumers) {
		const list = consumersByTopic.get(c.topic) ?? [];
		list.push(c);
		consumersByTopic.set(c.topic, list);
	}
	const topicByName = new Map(topics.map(t => [t.name, t]));

	const walkUseCase = (w: Walker, useCaseId: string, parent: number, depth: number) => {
		if (depth > MAX_DEPTH || w.steps.length >= MAX_STEPS) return;
		const uc = useCaseById.get(useCaseId);
		if (!uc) return;
		if (w.visitedUseCases.has(useCaseId)) return;
		w.visitedUseCases.add(useCaseId);
		w.useCaseIds.add(useCaseId);

		const index = push(w, {
			depth,
			kind: uc.tags.includes('manager') ? 'manager' : 'use-case',
			id: uc.id,
			repoId: uc.repoId,
			label: uc.title || uc.name,
			detail: uc.className,
			parent,
		});

		for (const system of uc.systems) {
			if (system === 'kafka') continue;
			w.systems.add(system);
			if (w.steps.length < MAX_STEPS) {
				push(w, {
					depth: depth + 1,
					kind: 'system',
					id: system,
					repoId: null,
					label: input.systemTitles.get(system) ?? system,
					parent: index,
				});
			}
		}

		for (const topic of uc.producesTopics) {
			walkTopic(w, topic, index, depth + 1);
		}
	};

	const walkTopic = (w: Walker, topicName: string, parent: number, depth: number) => {
		if (depth > MAX_DEPTH || w.steps.length >= MAX_STEPS) return;
		if (w.visitedTopics.has(topicName)) return;
		w.visitedTopics.add(topicName);
		w.topics.add(topicName);
		const topic = topicByName.get(topicName);
		const index = push(w, {
			depth,
			kind: 'topic',
			id: topicName,
			repoId: null,
			label: topicName,
			detail: topic?.kind,
			parent,
		});

		const handlers = (consumersByTopic.get(topicName) ?? []).filter(c => !c.isReplyListener);
		for (const handler of handlers) {
			if (w.steps.length >= MAX_STEPS) {
				w.steps[index].truncated = true;
				break;
			}
			const consumerIndex = push(w, {
				depth: depth + 1,
				kind: 'consumer',
				id: handler.id,
				repoId: handler.repoId,
				label: `${handler.controller}.${handler.handler}`,
				detail: handler.payloadType ?? undefined,
				parent: index,
			});
			for (const useCaseId of handler.useCaseIds) {
				walkUseCase(w, useCaseId, consumerIndex, depth + 2);
			}
		}
	};

	const newWalker = (): Walker => ({
		steps: [],
		repos: new Set(),
		topics: new Set(),
		systems: new Set(),
		useCaseIds: new Set(),
		visitedTopics: new Set(),
		visitedUseCases: new Set(),
	});

	const flows: Flow[] = [];

	for (const endpoint of endpoints) {
		const w = newWalker();
		const root = push(w, {
			depth: 0,
			kind: 'endpoint',
			id: endpoint.id,
			repoId: endpoint.repoId,
			label: `${endpoint.method} ${endpoint.path}`,
			detail: endpoint.summary ?? endpoint.controller,
			parent: null,
		});
		for (const useCaseId of endpoint.useCaseIds) walkUseCase(w, useCaseId, root, 1);

		flows.push({
			id: `flow:${endpoint.id}`,
			title: endpoint.summary || `${endpoint.method} ${endpoint.path}`,
			entry: { kind: 'endpoint', id: endpoint.id },
			entryRepoId: endpoint.repoId,
			summary: describeFlow(w, input, `${endpoint.method} ${endpoint.path}`),
			steps: w.steps,
			repos: [...w.repos],
			topics: [...w.topics],
			systems: [...w.systems],
			useCaseIds: [...w.useCaseIds],
			mermaid: toMermaid(w.steps, input),
			crossService: w.repos.size > 1,
			tags: [...endpoint.tags, ...(endpoint.permissions.length ? ['permissioned'] : [])],
			external: true,
			producedBy: [],
		});
	}

	// Every topic that something here actually handles gets its own flow, so you
	// can look a topic up directly instead of having to guess which HTTP call
	// happens to reach it. Topics nobody here publishes are the true platform
	// entry points and are marked as such.
	const producedTopics = new Set<string>();
	for (const uc of useCases) for (const t of uc.producesTopics) producedTopics.add(t);

	for (const topic of topics) {
		const handlers = (consumersByTopic.get(topic.name) ?? []).filter(c => !c.isReplyListener);
		if (!handlers.length) continue;
		const isExternalEntry = !producedTopics.has(topic.name);

		const w = newWalker();
		const root = push(w, {
			depth: 0,
			kind: 'topic',
			id: topic.name,
			repoId: null,
			label: topic.name,
			detail: isExternalEntry ? 'entry topic (published outside these repos)' : topic.kind,
			parent: null,
		});
		w.visitedTopics.add(topic.name);
		w.topics.add(topic.name);
		for (const handler of handlers) {
			const consumerIndex = push(w, {
				depth: 1,
				kind: 'consumer',
				id: handler.id,
				repoId: handler.repoId,
				label: `${handler.controller}.${handler.handler}`,
				detail: handler.payloadType ?? undefined,
				parent: root,
			});
			for (const useCaseId of handler.useCaseIds) walkUseCase(w, useCaseId, consumerIndex, 2);
		}

		flows.push({
			id: `flow:topic:${topic.name}`,
			title: topicTitle(topic.name),
			entry: { kind: 'topic', id: topic.name },
			entryRepoId: handlers[0].repoId,
			summary: describeFlow(w, input, topic.name),
			steps: w.steps,
			repos: [...w.repos],
			topics: [...w.topics],
			systems: [...w.systems],
			useCaseIds: [...w.useCaseIds],
			mermaid: toMermaid(w.steps, input),
			crossService: w.repos.size > 1,
			tags: ['kafka', topic.kind, ...(isExternalEntry ? ['entry-topic'] : [])],
			external: isExternalEntry,
			producedBy: topic.producedBy,
		});
	}

	return flows.sort((a, b) => b.steps.length - a.steps.length);
}

export function topicTitle(topic: string): string {
	const last = topic.split('.').pop() ?? topic;
	return last
		.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
		.replace(/^./, c => c.toUpperCase())
		.trim();
}

function describeFlow(w: Walker, input: GraphInput, entryLabel: string): string {
	const repoNames = [...w.repos].map(r => input.repoTitles.get(r) ?? r);
	const parts: string[] = [];
	parts.push(`${entryLabel} is handled by ${repoNames.join(' then ') || 'no resolved handler'}.`);
	if (w.topics.size) {
		parts.push(
			`It moves across ${w.topics.size} Kafka topic${w.topics.size === 1 ? '' : 's'}.`,
		);
	}
	if (w.systems.size) {
		parts.push(
			`Downstream it touches ${[...w.systems].map(s => input.systemTitles.get(s) ?? s).join(', ')}.`,
		);
	}
	return parts.join(' ');
}

function mermaidId(prefix: string, index: number): string {
	return `${prefix}${index}`;
}

function escapeLabel(label: string): string {
	return label.replace(/"/g, "'").replace(/[[\]{}()|<>]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function toMermaid(steps: FlowStep[], input: GraphInput): string {
	if (!steps.length) return '';
	const lines: string[] = ['flowchart TD'];
	const byRepo = new Map<string, number[]>();
	steps.forEach((step, i) => {
		const key = step.repoId ?? (step.kind === 'topic' ? '__bus' : '__system');
		const list = byRepo.get(key) ?? [];
		list.push(i);
		byRepo.set(key, list);
	});

	const nodeLine = (step: FlowStep, i: number): string => {
		const id = mermaidId('n', i);
		const label = escapeLabel(step.label);
		switch (step.kind) {
			case 'endpoint':
				return `    ${id}["${label}"]:::endpoint`;
			case 'topic':
				return `    ${id}[/"${label}"/]:::topic`;
			case 'consumer':
				return `    ${id}["${label}"]:::consumer`;
			case 'system':
				return `    ${id}[("${label}")]:::system`;
			case 'manager':
				return `    ${id}["${label}"]:::manager`;
			default:
				return `    ${id}["${label}"]:::usecase`;
		}
	};

	for (const [key, indices] of byRepo) {
		if (key === '__bus') {
			lines.push('  subgraph bus["Kafka event bus"]');
		} else if (key === '__system') {
			lines.push('  subgraph sys["Downstream systems"]');
		} else {
			lines.push(`  subgraph ${key.replace(/[^a-zA-Z0-9]/g, '_')}["${escapeLabel(input.repoTitles.get(key) ?? key)}"]`);
		}
		for (const i of indices) lines.push(nodeLine(steps[i], i));
		lines.push('  end');
	}

	steps.forEach((step, i) => {
		if (step.parent === null) return;
		lines.push(`  ${mermaidId('n', step.parent)} --> ${mermaidId('n', i)}`);
	});

	lines.push('  classDef endpoint fill:#1d4ed8,stroke:#1e3a8a,color:#fff');
	lines.push('  classDef topic fill:#7c2d12,stroke:#7c2d12,color:#fff');
	lines.push('  classDef consumer fill:#0f766e,stroke:#115e59,color:#fff');
	lines.push('  classDef usecase fill:#312e81,stroke:#1e1b4b,color:#fff');
	lines.push('  classDef manager fill:#4c1d95,stroke:#2e1065,color:#fff');
	lines.push('  classDef system fill:#334155,stroke:#0f172a,color:#fff');
	return lines.join('\n');
}
