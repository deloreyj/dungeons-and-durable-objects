import { Link, useLoaderData } from '@remix-run/react';
import { json } from '@remix-run/node';
import type { LoaderFunctionArgs } from '@remix-run/node';
import { Button } from '~/components/ui/button';
import { Card, CardHeader, CardContent } from '~/components/ui/card';
import { useEffect } from 'react';

interface EncounterResponse {
	success: boolean;
	encounterID: string;
	encounterName: string;
}

export async function loader({ context }: LoaderFunctionArgs) {
	const request = new Request(`${context.cloudflare.env.API_BASE_URL}/encounter`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
		},
	});
	const response = await context.cloudflare.env.API.fetch(request);

	console.log('Response:', response.ok);
	console.log('Response:', response.status);
	console.log('Response:', response.statusText);

	const data = (await response.json()) as EncounterResponse;
	console.log('Data:', data);
	return json(data);
}

export default function CreateEncounter() {
	const data = useLoaderData<typeof loader>();

	useEffect(() => {
		if (data?.encounterID) {
			const encounters = JSON.parse(localStorage.getItem('encounters') || '[]');
			const encounterExists = encounters.some((encounter: { id: string }) => encounter.id === data.encounterID);
			if (!encounterExists) {
				const encounterInfo = {
					id: data.encounterID,
					name: data.encounterName,
					status: 'PREPARING' as const,
				};
				encounters.push(encounterInfo);
				localStorage.setItem('encounters', JSON.stringify(encounters));
			}
		}
	}, [data.encounterID, data.encounterName]);

	if (!data?.encounterID) {
		return <div>Error creating encounter</div>;
	}

	return (
		<div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
			<div className="max-w-3xl mx-auto">
				<div className="flex items-center justify-between mb-8">
					<Link to="/">
						<Button variant="ghost" className="text-gray-600 hover:text-gray-900">
							← Back
						</Button>
					</Link>
				</div>

				<Card className="shadow-xl border-0">
					<CardHeader className="space-y-1 pb-8 border-b">
						<h1 className="text-3xl font-bold tracking-tight">Encounter Created!</h1>
						<p className="text-sm text-muted-foreground">Share this ID with your players to join the encounter</p>
					</CardHeader>
					<CardContent className="pt-6">
						<div className="space-y-6">
							<div className="p-4 bg-green-50 border border-green-200 text-green-700 rounded-lg">
								<p className="font-medium">Your encounter ID is:</p>
								<p className="text-2xl font-mono mt-2">{data.encounterID}</p>
							</div>
							<div className="space-y-4">
								<p className="text-gray-600">To join this encounter:</p>
								<ol className="list-decimal list-inside space-y-2 text-gray-600">
									<li>Share this ID with your players</li>
									<li>Have them navigate to the &quot;Join Encounter&quot; page</li>
									<li>Enter this ID to join the encounter</li>
								</ol>
							</div>
							<div className="flex gap-4">
								<Button asChild className="w-full">
									<Link to={`/encounter/${data.encounterID}`}>Go to Encounter</Link>
								</Button>
							</div>
						</div>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
