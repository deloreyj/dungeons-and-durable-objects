import type { MetaFunction } from '@remix-run/cloudflare';
import { Link } from '@remix-run/react';
import { Button } from '~/components/ui/button';
import { useEffect, useState } from 'react';
import { Card, CardHeader, CardContent } from '~/components/ui/card';
import { ScrollArea } from '~/components/ui/scroll-area';

interface EncounterState {
	id: string;
	name: string;
	status: 'PREPARING' | 'IN_PROGRESS' | 'COMPLETED';
}

function MyEncounters() {
	const [encounters, setEncounters] = useState<EncounterState[]>([]);

	useEffect(() => {
		const savedEncounters = JSON.parse(localStorage.getItem('encounters') || '[]');
		setEncounters(savedEncounters);
	}, []);

	if (encounters.length === 0) return null;

	return (
		<Card className="w-full max-w-md mt-8">
			<CardHeader>
				<h2 className="text-xl font-semibold">My Encounters</h2>
			</CardHeader>
			<CardContent>
				<ScrollArea className="h-[300px]">
					<div className="space-y-2">
						{encounters.map((encounter) => (
							<Link key={encounter.id} to={`/encounter/${encounter.id}`} className="block p-3 hover:bg-gray-100 rounded-lg">
								<div className="flex justify-between items-center">
									<span className="font-medium">{encounter.name}</span>
									<span className="text-sm text-gray-500">{encounter.status}</span>
								</div>
							</Link>
						))}
					</div>
				</ScrollArea>
			</CardContent>
		</Card>
	);
}

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
			<MyEncounters />
		</div>
	);
}
