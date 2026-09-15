import { Link } from 'react-router-dom';

import { PageHead } from '../components/ui';

export function NotFoundPage() {
	return (
		<>
			<PageHead title="Nothing here">
				That link does not match anything in the catalog. If it used to work, the underlying code
				may have been renamed or deleted in a later commit on <code>sit</code>.
			</PageHead>
			<div className="card">
				<p style={{ marginTop: 0 }}>Good places to pick up from:</p>
				<ul>
					<li>
						<Link to="/">Overview</Link> — how the four services fit together
					</li>
					<li>
						<Link to="/guide">New joiner guide</Link> — read this first if you are new
					</li>
					<li>
						<Link to="/database">Mongo collections</Link> — tables, columns, who writes, who reads
					</li>
					<li>
						<Link to="/dependencies">HTTP dependencies</Link> — axios calls to D03, SAP, PNS, …
					</li>
					<li>
						Press <kbd>⌘K</kbd> and search by name
					</li>
				</ul>
			</div>
		</>
	);
}
