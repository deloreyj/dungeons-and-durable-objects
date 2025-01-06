import { Link } from '@remix-run/react';
import { Button } from '~/components/ui/button';

export default function CreateCharacter() {
	return (
		<div className="p-4">
			<Link to="/" className="mb-8 inline-block">
				<Button variant="outline">← Back</Button>
			</Link>
			<h1 className="text-4xl font-bold mt-4">Create Character</h1>
		</div>
	);
}
