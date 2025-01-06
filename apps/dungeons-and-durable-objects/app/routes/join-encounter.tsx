import { Link } from '@remix-run/react';
import { Button } from '~/components/ui/button';

export default function JoinEncounter() {
	return (
		<div className="p-4">
			<Link to="/" className="mb-8 inline-block">
				<Button variant="outline">← Back</Button>
			</Link>
			<h1 className="text-4xl font-bold mt-4">Join Encounter</h1>
		</div>
	);
}
