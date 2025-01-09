import { useLoaderData, useNavigate } from '@remix-run/react';
import type { LoaderFunctionArgs } from '@remix-run/node';
import { Card, CardHeader, CardContent } from '~/components/ui/card';
import { Button } from '~/components/ui/button';

interface Action {
	name: string;
	type: 'weapon' | 'special';
	attackBonus?: number;
	damage?: {
		diceCount: number;
		diceType: number;
		modifier: number;
		type: string;
	};
	description?: string;
}

interface CharacterState {
	name: string;
	backstory: string;
	alignment: string;
	appearance: string;
	race: string;
	characterClass?: string;
	stats: {
		strength: number;
		dexterity: number;
		constitution: number;
		intelligence: number;
		wisdom: number;
		charisma: number;
	};
	currentHp: number;
	maxHp: number;
	inventory: string[];
	conditions: string[];
	speed: number;
	initiativeModifier: number;
	armor: {
		baseAC: number;
		type: 'none' | 'light' | 'medium' | 'heavy';
		isShieldEquipped: boolean;
		magicBonus: number;
	};
	savingThrows: Record<string, boolean>;
	proficiencyBonus: number;
	level: number;
	skills: Record<string, boolean>;
	actions: Action[];
	bonusActions: Action[];
}

export async function loader({ params, context }: LoaderFunctionArgs) {
	if (!params.name) {
		throw new Response('Character name is required', { status: 400 });
	}

	const response = await fetch(`${context.cloudflare.env.API_BASE_URL}/character?name=${params.name}`, {
		method: 'GET',
		headers: {
			'Content-Type': 'application/json',
		},
	});

	if (!response.ok) {
		throw new Response('Character not found', { status: 404 });
	}

	const characterData = (await response.json()) as CharacterState;
	if (!characterData || !characterData.stats) {
		throw new Response('Invalid character data', { status: 500 });
	}

	const imageUrl = `${context.cloudflare.env.API_BASE_URL}/characters/${encodeURIComponent(params.name)}/image`;

	return Response.json({ character: characterData, imageUrl } as const);
}

function StatBlock({ label, value }: { label: string; value: number }) {
	const modifier = Math.floor((value - 10) / 2);
	return (
		<div className="text-center p-4 border rounded-lg">
			<div className="text-sm text-gray-600">{label}</div>
			<div className="text-2xl font-bold">{value}</div>
			<div className="text-sm">{modifier >= 0 ? `+${modifier}` : modifier}</div>
		</div>
	);
}

export default function CharacterSheet() {
	const data = useLoaderData<typeof loader>();
	const { character, imageUrl } = data as { character: CharacterState; imageUrl: string };
	const navigate = useNavigate();

	if (!character || !character.stats) {
		return (
			<div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
				<div className="max-w-4xl mx-auto text-center">
					<h2 className="text-2xl font-bold text-gray-900">Character data is invalid</h2>
				</div>
			</div>
		);
	}

	console.log(character);

	return (
		<div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
			<div className="max-w-4xl mx-auto">
				<div className="flex items-center justify-between mb-8">
					<Button variant="ghost" className="text-gray-600 hover:text-gray-900" onClick={() => navigate(-1)}>
						← Back
					</Button>
				</div>

				<div className="grid grid-cols-1 md:grid-cols-3 gap-6">
					{/* Left Column - Basic Info & Image */}
					<Card className="md:col-span-1">
						<CardHeader>
							<h2 className="text-2xl font-bold">{character.name}</h2>
							<p className="text-sm text-gray-600">
								Level {character.level} {character.race} {character.characterClass}
							</p>
						</CardHeader>
						<CardContent>
							<img
								src={imageUrl}
								alt={character.name}
								className="w-full h-auto rounded-lg shadow-lg mb-4"
								onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
									console.error('Failed to load image');
									e.currentTarget.style.display = 'none';
								}}
							/>
							<div className="space-y-2">
								<p>
									<strong>Alignment:</strong> {character.alignment}
								</p>
								<p>
									<strong>Speed:</strong> {character.speed} ft.
								</p>
								<p>
									<strong>Initiative:</strong> {character.initiativeModifier >= 0 ? '+' : ''}
									{character.initiativeModifier}
								</p>
								<p>
									<strong>Armor Class:</strong>{' '}
									{character.armor?.baseAC + (character.armor?.isShieldEquipped ? 2 : 0) + character.armor?.magicBonus}
								</p>
							</div>
							{(character.actions?.length > 0 || character.bonusActions?.length > 0) && (
								<div className="mt-4 space-y-4">
									{character.actions?.length > 0 && (
										<div>
											<h3 className="font-semibold mb-2">Actions</h3>
											<div className="space-y-2">
												{character.actions?.map((action, index) => (
													<div key={index} className="text-sm">
														<p className="font-medium">{action.name}</p>
														{action.type === 'weapon' && action.damage && (
															<p className="text-gray-600">
																Attack: {action.attackBonus && (action.attackBonus >= 0 ? '+' : '')}
																{action.attackBonus} | Damage: {action.damage.diceCount}d{action.damage.diceType} + {action.damage.modifier}{' '}
																{action.damage.type}
															</p>
														)}
														{action.description && <p className="text-gray-600">{action.description}</p>}
													</div>
												))}
											</div>
										</div>
									)}
									{character.bonusActions?.length > 0 && (
										<div>
											<h3 className="font-semibold mb-2">Bonus Actions</h3>
											<div className="space-y-2">
												{character.bonusActions?.map((action, index) => (
													<div key={index} className="text-sm">
														<p className="font-medium">{action.name}</p>
														{action.type === 'weapon' && action.damage && (
															<p className="text-gray-600">
																Attack: {action.attackBonus && (action.attackBonus >= 0 ? '+' : '')}
																{action.attackBonus} | Damage: {action.damage.diceCount}d{action.damage.diceType} + {action.damage.modifier}{' '}
																{action.damage.type}
															</p>
														)}
														{action.description && <p className="text-gray-600">{action.description}</p>}
													</div>
												))}
											</div>
										</div>
									)}
								</div>
							)}
						</CardContent>
					</Card>

					{/* Middle Column - Stats & Health */}
					<Card className="md:col-span-1">
						<CardHeader>
							<h2 className="text-xl font-bold">Abilities</h2>
						</CardHeader>
						<CardContent>
							<div className="grid grid-cols-2 gap-4">
								<StatBlock label="Strength" value={character.stats.strength} />
								<StatBlock label="Dexterity" value={character.stats.dexterity} />
								<StatBlock label="Constitution" value={character.stats.constitution} />
								<StatBlock label="Intelligence" value={character.stats.intelligence} />
								<StatBlock label="Wisdom" value={character.stats.wisdom} />
								<StatBlock label="Charisma" value={character.stats.charisma} />
							</div>
							<div className="mt-6 p-4 border rounded-lg">
								<div className="text-center">
									<div className="text-sm text-gray-600">Hit Points</div>
									<div className="text-2xl font-bold">
										{character.currentHp} / {character.maxHp}
									</div>
								</div>
							</div>
						</CardContent>
					</Card>

					{/* Right Column - Skills & Features */}
					<Card className="md:col-span-1">
						<CardHeader>
							<h2 className="text-xl font-bold">Proficiencies & Skills</h2>
						</CardHeader>
						<CardContent>
							<div className="space-y-4">
								<div>
									<h3 className="font-semibold mb-2">Saving Throws</h3>
									<div className="space-y-1">
										{Object.entries(character.savingThrows).map(([ability, isProficient]) => {
											const abilityScore = character.stats[ability.toLowerCase() as keyof typeof character.stats];
											const modifier = Math.floor((abilityScore - 10) / 2) + (isProficient ? character.proficiencyBonus : 0);
											return (
												<div key={ability} className="flex items-center justify-between">
													<span className={isProficient ? 'font-semibold' : 'text-gray-600'}>
														{ability.charAt(0).toUpperCase() + ability.slice(1)}
													</span>
													<span className={isProficient ? 'font-semibold' : 'text-gray-600'}>
														{modifier >= 0 ? `+${modifier}` : modifier}
													</span>
												</div>
											);
										})}
									</div>
								</div>
								<div>
									<h3 className="font-semibold mb-2">Skills</h3>
									<div className="space-y-1">
										{Object.entries(character.skills).map(([skill, isProficient]) => {
											const abilityMap: Record<string, keyof typeof character.stats> = {
												acrobatics: 'dexterity',
												animalHandling: 'wisdom',
												arcana: 'intelligence',
												athletics: 'strength',
												deception: 'charisma',
												history: 'intelligence',
												insight: 'wisdom',
												intimidation: 'charisma',
												investigation: 'intelligence',
												medicine: 'wisdom',
												nature: 'intelligence',
												perception: 'wisdom',
												performance: 'charisma',
												persuasion: 'charisma',
												religion: 'intelligence',
												sleightOfHand: 'dexterity',
												stealth: 'dexterity',
												survival: 'wisdom',
											};
											const ability = abilityMap[skill];
											const abilityScore = character.stats[ability];
											const modifier = Math.floor((abilityScore - 10) / 2) + (isProficient ? character.proficiencyBonus : 0);
											return (
												<div key={skill} className="flex items-center justify-between">
													<span className={isProficient ? 'font-semibold' : 'text-gray-600'}>
														{skill
															.replace(/([A-Z])/g, ' $1')
															.trim()
															.charAt(0)
															.toUpperCase() +
															skill
																.replace(/([A-Z])/g, ' $1')
																.trim()
																.slice(1)}
													</span>
													<span className={isProficient ? 'font-semibold' : 'text-gray-600'}>
														{modifier >= 0 ? `+${modifier}` : modifier}
													</span>
												</div>
											);
										})}
									</div>
								</div>
							</div>
						</CardContent>
					</Card>

					{/* Full Width Cards */}
					<Card className="md:col-span-3">
						<CardHeader>
							<h2 className="text-xl font-bold">Background</h2>
						</CardHeader>
						<CardContent>
							<div className="space-y-4">
								<div>
									<h3 className="font-semibold">Appearance</h3>
									<p className="text-gray-700">{character.appearance}</p>
								</div>
								<div>
									<h3 className="font-semibold">Backstory</h3>
									<p className="text-gray-700">{character.backstory}</p>
								</div>
							</div>
						</CardContent>
					</Card>

					<Card className="md:col-span-3">
						<CardHeader>
							<h2 className="text-xl font-bold">Equipment & Conditions</h2>
						</CardHeader>
						<CardContent>
							<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
								<div>
									<h3 className="font-semibold mb-2">Inventory</h3>
									<ul className="list-disc list-inside text-gray-700">
										{character.inventory.map((item: string, index: number) => (
											<li key={index}>{item}</li>
										))}
									</ul>
								</div>
								<div>
									<h3 className="font-semibold mb-2">Active Conditions</h3>
									<ul className="list-disc list-inside text-gray-700">
										{Array.from(character.conditions).map((condition: string, index: number) => (
											<li key={index}>{condition}</li>
										))}
									</ul>
								</div>
							</div>
						</CardContent>
					</Card>
				</div>
			</div>
		</div>
	);
}
