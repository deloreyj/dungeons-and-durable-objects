import { Link, useActionData, Form } from '@remix-run/react';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { Card, CardHeader, CardContent } from '~/components/ui/card';
import { RadioGroup, RadioGroupItem } from '~/components/ui/radio-group';
import { useEffect, useState } from 'react';
import type { ActionFunctionArgs } from '@remix-run/node';
import { redirect } from '@remix-run/node';

type StoredCharacter = {
	id: string;
	name: string;
	race: string;
	class: string;
};

export async function action({ request, context }: ActionFunctionArgs) {
	const formData = await request.formData();
	const encounterId = formData.get('encounterId') as string;
	const characterId = formData.get('characterId') as string;

	const response = await fetch(`${context.cloudflare.env.API_BASE_URL}/encounter/${encounterId}/characters/${characterId}`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
		},
	});

	const result = (await response.json()) as { success: boolean };

	if (result.success) {
		return redirect(`/encounter/${encounterId}`);
	}

	return result;
}

export default function JoinEncounter() {
	const [characters, setCharacters] = useState<StoredCharacter[]>([]);
	const actionData = useActionData<{ success: boolean }>();

	useEffect(() => {
		const storedCharacters = JSON.parse(localStorage.getItem('characters') || '[]');
		setCharacters(storedCharacters);
	}, []);

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
						<h1 className="text-3xl font-bold tracking-tight">Join Encounter</h1>
						<p className="text-sm text-muted-foreground">Join an existing D&D encounter</p>
					</CardHeader>
					<CardContent className="pt-6">
						<Form method="post" className="space-y-8">
							<div className="space-y-2">
								<Label htmlFor="encounterId">Encounter ID</Label>
								<Input id="encounterId" name="encounterId" required placeholder="Enter the encounter ID" />
							</div>

							{characters.length > 0 ? (
								<div className="space-y-2">
									<Label>Select Character</Label>
									<RadioGroup name="characterId" className="space-y-4">
										{characters.map((char) => (
											<div key={char.id} className="flex items-center space-x-3 p-4 border rounded-lg">
												<RadioGroupItem value={char.id} id={char.id} />
												<Label htmlFor={char.id} className="flex-1">
													<div className="font-semibold">{char.name}</div>
													<div className="text-sm text-muted-foreground">
														{char.race} {char.class}
													</div>
												</Label>
											</div>
										))}
									</RadioGroup>
								</div>
							) : (
								<div className="text-center p-8 border rounded-lg bg-muted">
									<p className="text-muted-foreground">No characters found. Create a character first.</p>
									<Link to="/create-character" className="mt-4 inline-block">
										<Button variant="outline">Create Character</Button>
									</Link>
								</div>
							)}

							{characters.length > 0 && (
								<Button type="submit" size="lg" className="w-full">
									Join Encounter
								</Button>
							)}
						</Form>

						{actionData?.success && (
							<div className="mt-6 p-4 bg-green-50 border border-green-200 text-green-700 rounded-lg">
								<p>Successfully joined the encounter!</p>
							</div>
						)}
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
