import type { MetaFunction } from '@remix-run/cloudflare';
import { Link } from '@remix-run/react';
import { Button } from '~/components/ui/button';

export const meta: MetaFunction = () => {
	return [
		{ title: 'Dungeons & Durable Objects' },
		{
			name: 'description',
			content: 'A D&D companion app built with Cloudflare Durable Objects',
		},
	];
};

export default function Index() {
	return (
		<div className="font-sans p-4 flex flex-col items-center">
			<h1 className="text-4xl font-bold mb-8">Dungeons & Durable Objects</h1>
			<div className="flex flex-col gap-4 w-48">
				<Link to="/create-encounter" className="w-full">
					<Button className="w-full">Create Encounter</Button>
				</Link>
				<Link to="/create-character" className="w-full">
					<Button className="w-full">Create Character</Button>
				</Link>
				<Link to="/join-encounter" className="w-full">
					<Button className="w-full">Join Encounter</Button>
				</Link>
			</div>
		</div>
	);
}
