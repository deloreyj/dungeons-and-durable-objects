import { Link, useActionData, Form } from '@remix-run/react';
import type { ActionFunctionArgs } from '@remix-run/node';
import { Button } from '~/components/ui/button';
import { Card, CardHeader, CardContent } from '~/components/ui/card';
import { Input } from '~/components/ui/input';
import { Textarea } from '~/components/ui/textarea';
import { Label } from '~/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select';

export async function action({ request, context }: ActionFunctionArgs) {
	const formData = await request.formData();
	const name = formData.get('name') as string;
	const backstory = formData.get('backstory') as string;
	const alignment = formData.get('alignment') as string;
	const appearance = formData.get('appearance') as string;
	const characterClass = formData.get('characterClass') as string;
	const race = formData.get('race') as string;

	const response = await fetch(`${context.cloudflare.env.API_BASE_URL}/character`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			name,
			backstory,
			alignment,
			appearance,
			characterClass,
			race,
		}),
	});

	return response.json();
}

export default function CreateCharacter() {
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
						<h1 className="text-3xl font-bold tracking-tight">Create Character</h1>
						<p className="text-sm text-muted-foreground">Create your D&D character</p>
					</CardHeader>
					<CardContent className="pt-6">
						<Form method="post" className="space-y-8">
							<div className="space-y-2">
								<Label htmlFor="name">Character Name</Label>
								<Input id="name" name="name" required defaultValue="Thorin Oakenslayer" />
							</div>

							<div className="space-y-2">
								<Label htmlFor="race">Race</Label>
								<Select name="race" required defaultValue="Dwarf">
									<SelectTrigger>
										<SelectValue placeholder="Select race" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="Human">Human</SelectItem>
										<SelectItem value="Elf">Elf</SelectItem>
										<SelectItem value="Dwarf">Dwarf</SelectItem>
										<SelectItem value="Halfling">Halfling</SelectItem>
										<SelectItem value="Gnome">Gnome</SelectItem>
										<SelectItem value="Half-Elf">Half-Elf</SelectItem>
										<SelectItem value="Half-Orc">Half-Orc</SelectItem>
										<SelectItem value="Tiefling">Tiefling</SelectItem>
									</SelectContent>
								</Select>
							</div>

							<div className="space-y-2">
								<Label htmlFor="characterClass">Class</Label>
								<Select name="characterClass" required defaultValue="Fighter">
									<SelectTrigger>
										<SelectValue placeholder="Select class" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="Barbarian">Barbarian</SelectItem>
										<SelectItem value="Bard">Bard</SelectItem>
										<SelectItem value="Cleric">Cleric</SelectItem>
										<SelectItem value="Druid">Druid</SelectItem>
										<SelectItem value="Fighter">Fighter</SelectItem>
										<SelectItem value="Monk">Monk</SelectItem>
										<SelectItem value="Paladin">Paladin</SelectItem>
										<SelectItem value="Ranger">Ranger</SelectItem>
										<SelectItem value="Rogue">Rogue</SelectItem>
										<SelectItem value="Sorcerer">Sorcerer</SelectItem>
										<SelectItem value="Warlock">Warlock</SelectItem>
										<SelectItem value="Wizard">Wizard</SelectItem>
									</SelectContent>
								</Select>
							</div>

							<div className="space-y-2">
								<Label htmlFor="alignment">Alignment</Label>
								<Select name="alignment" required defaultValue="lawful_good">
									<SelectTrigger>
										<SelectValue placeholder="Select alignment" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="lawful_good">Lawful Good</SelectItem>
										<SelectItem value="neutral_good">Neutral Good</SelectItem>
										<SelectItem value="chaotic_good">Chaotic Good</SelectItem>
										<SelectItem value="lawful_neutral">Lawful Neutral</SelectItem>
										<SelectItem value="true_neutral">True Neutral</SelectItem>
										<SelectItem value="chaotic_neutral">Chaotic Neutral</SelectItem>
										<SelectItem value="lawful_evil">Lawful Evil</SelectItem>
										<SelectItem value="neutral_evil">Neutral Evil</SelectItem>
										<SelectItem value="chaotic_evil">Chaotic Evil</SelectItem>
									</SelectContent>
								</Select>
							</div>

							<div className="space-y-2">
								<Label htmlFor="appearance">Physical Description</Label>
								<Textarea
									id="appearance"
									name="appearance"
									required
									placeholder="Describe your character's physical appearance"
									className="min-h-[100px]"
									defaultValue="A stout dwarf with a braided beard adorned with golden rings. Wears heavy plate armor and carries a mighty warhammer."
								/>
							</div>

							<div className="space-y-2">
								<Label htmlFor="backstory">Backstory</Label>
								<Textarea
									id="backstory"
									name="backstory"
									required
									placeholder="Write your character's background story"
									className="min-h-[200px]"
									defaultValue="Born to a noble dwarven family in the mountain fortress of Khazad-dûm, Thorin trained from youth in the arts of war and leadership. After his clan was driven from their home by a ancient dragon, he now seeks to reclaim his ancestral halls and restore his family's honor."
								/>
							</div>

							<Button type="submit" size="lg" className="w-full">
								Create Character
							</Button>
						</Form>

						{actionData?.success && (
							<div className="mt-6 p-4 bg-green-50 border border-green-200 text-green-700 rounded-lg">Character created successfully!</div>
						)}
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
