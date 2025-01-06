import { Link, useActionData, Form } from '@remix-run/react';
import type { ActionFunctionArgs } from '@remix-run/node';
import { Button } from '~/components/ui/button';
import { Card, CardHeader, CardContent } from '~/components/ui/card';
import { Input } from '~/components/ui/input';
import { Textarea } from '~/components/ui/textarea';
import { Label } from '~/components/ui/label';

export async function action({ request, context }: ActionFunctionArgs) {
	const formData = await request.formData();
	const name = formData.get('name') as string;
	const arealDescription = formData.get('arealDescription') as string;
	const encounterDescription = formData.get('encounterDescription') as string;

	const response = await fetch(`${context.cloudflare.env.API_BASE_URL}/encounter`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			name,
			arealDescription,
			encounterDescription,
		}),
	});

	return response.json();
}

export default function CreateEncounter() {
	const actionData = useActionData<typeof action>();

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
						<h1 className="text-3xl font-bold tracking-tight">Create Encounter</h1>
						<p className="text-sm text-muted-foreground">Fill in the details below to create a new encounter</p>
					</CardHeader>
					<CardContent className="pt-6">
						<Form method="post" className="space-y-8">
							<div className="space-y-2">
								<Label htmlFor="name" className="text-base">
									Encounter Name
								</Label>
								<Input
									id="name"
									name="name"
									required
									placeholder="Enter the name of your encounter"
									className="h-11"
									defaultValue={'Battle of Osgiliath'}
								/>
							</div>

							<div className="space-y-2">
								<Label htmlFor="arealDescription" className="text-base">
									Area Description
								</Label>
								<Textarea
									id="arealDescription"
									name="arealDescription"
									required
									placeholder="Describe the area where this encounter takes place"
									className="min-h-[120px] resize-none"
									defaultValue="In a courtyard of the ruined city"
								/>
							</div>

							<div className="space-y-2">
								<Label htmlFor="encounterDescription" className="text-base">
									Encounter Description
								</Label>
								<Textarea
									id="encounterDescription"
									name="encounterDescription"
									required
									placeholder="Describe what happens in this encounter"
									className="min-h-[120px] resize-none"
									defaultValue="The party is ambushed by a group of orcs in the ruins of Osgiliath. The orcs are led by a powerful warlord known as the Skull Crusher. You must find a way to defeat the orcs and escape to Minas Tirith."
								/>
							</div>

							<Button type="submit" size="lg" className="w-full">
								Create Encounter
							</Button>
						</Form>

						{actionData?.success && (
							<div className="mt-6 p-4 bg-green-50 border border-green-200 text-green-700 rounded-lg">
								Encounter created successfully! ID: {actionData.encounterID}
							</div>
						)}
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
