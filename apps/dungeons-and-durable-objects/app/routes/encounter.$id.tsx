import { useLoaderData, Link } from '@remix-run/react';
import { json } from '@remix-run/node';
import type { LoaderFunctionArgs } from '@remix-run/node';
import { Card, CardHeader, CardContent } from '~/components/ui/card';
import { Button } from '~/components/ui/button';
import { ScrollArea } from '~/components/ui/scroll-area';

interface Position {
	x: number;
	y: number;
}

interface TerrainCell {
	terrain: 'normal' | 'wall' | 'difficult' | 'water' | 'lava';
	cover?: 'none' | 'half' | 'three-quarters' | 'full';
	characterId?: string;
}

interface EncounterCharacter {
	id: string;
	name: string;
	team: 'Party' | 'Enemies';
	race: string;
	class?: string;
}

interface EncounterState {
	id: string;
	name: string;
	encounterDescription: string;
	mapSize: {
		width: number;
		height: number;
	};
	map: TerrainCell[][];
	characterPositions: Record<string, Position>;
	characters: (EncounterCharacter & { imageUrl?: string })[];
	currentTurn?: string;
	round: number;
	status: 'PREPARING' | 'IN_PROGRESS' | 'COMPLETED';
}

export async function loader({ params, context }: LoaderFunctionArgs) {
	const response = await fetch(`${context.cloudflare.env.API_BASE_URL}/encounter/${params.id}`, {
		method: 'GET',
		headers: {
			'Content-Type': 'application/json',
		},
	});

	if (!response.ok) {
		throw new Error('Failed to load encounter');
	}

	const data = (await response.json()) as EncounterState;
	const charactersWithImages = data.characters.map((character) => ({
		...character,
		imageUrl: `${context.cloudflare.env.API_BASE_URL}/characters/${encodeURIComponent(character.id)}/image`,
	}));

	const finalData = { ...data, characters: charactersWithImages };

	return json(finalData);
}

function MapCell({ cell, character }: { cell: TerrainCell; character?: EncounterCharacter }) {
	const terrainStyles = {
		wall: 'bg-gray-800',
		normal: 'bg-white',
		difficult: 'bg-green-500',
		water: 'bg-blue-100',
		lava: 'bg-red-200',
	};

	const coverStyles = {
		none: 'bg-opacity-25',
		half: 'bg-opacity-40',
		'three-quarters': 'bg-opacity-75',
		full: 'bg-opacity-90',
	};

	const characterColor = character?.team === 'Party' ? 'text-blue-600' : 'text-red-600';
	const bgColor = terrainStyles[cell.terrain];
	const coverStyle = cell.cover ? coverStyles[cell.cover] : '';

	const getTooltip = () => {
		if (character) {
			return `${character.name} (${character.race} ${character.class || ''})`;
		}
		const terrainText = cell.terrain.charAt(0).toUpperCase() + cell.terrain.slice(1);
		if (!cell.cover || cell.cover === 'none') {
			return terrainText;
		}
		const coverText = cell.cover
			.split('-')
			.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
			.join(' ');
		return `${terrainText} (${coverText} Cover)`;
	};

	return (
		<div
			className={`aspect-square border border-gray-100 ${bgColor} ${coverStyle} flex items-center justify-center relative`}
			title={getTooltip()}
		>
			{character && character.name && (
				<Link to={`/character/${character.id}`} className={`text-xl font-bold ${characterColor}`}>
					{character.name[0].toUpperCase()}
				</Link>
			)}
			{!character && cell.terrain !== 'normal' && (
				<span className="text-xs text-gray-500">
					{cell.terrain === 'wall' && '■'}
					{cell.terrain === 'difficult' && '▲'}
					{cell.terrain === 'water' && '~'}
					{cell.terrain === 'lava' && '≈'}
				</span>
			)}
		</div>
	);
}

function BattleMap({ state }: { state: EncounterState }) {
	return (
		<div className="flex items-start">
			<div
				className="grid gap-0"
				style={{
					gridTemplateColumns: `repeat(${state.mapSize.width}, minmax(0, 1fr))`,
				}}
			>
				{state.map.map((row, y) =>
					row.map((cell, x) => {
						const characterId = cell.characterId;
						const character = characterId ? state.characters.find((c) => c.id === characterId) : undefined;
						return <MapCell key={`${x}-${y}`} cell={cell} character={character} />;
					})
				)}
			</div>
		</div>
	);
}

function CharacterItem({ character }: { character: EncounterCharacter & { imageUrl?: string } }) {
	return (
		<div className="flex items-center gap-2 p-1.5 hover:bg-gray-100 rounded">
			{character.imageUrl && (
				<div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded border border-gray-200">
					<img
						src={character.imageUrl}
						alt={character.name}
						className="h-full w-full object-cover"
						onError={(e) => {
							console.error('Failed to load image:', character.imageUrl);
							(e.target as HTMLImageElement).style.display = 'none';
						}}
					/>
				</div>
			)}
			<div className="flex-1 min-w-0">
				<Link to={`/character/${character.id}`} className="block text-sm font-medium text-gray-900 truncate hover:text-blue-600">
					{character.name}
				</Link>
				<p className="text-xs text-gray-500 truncate">
					{character.race} {character.class}
				</p>
			</div>
		</div>
	);
}

function CharacterList({ characters, team }: { characters: EncounterCharacter[]; team: 'Party' | 'Enemies' }) {
	const teamCharacters = characters.filter((c) => c.team === team);
	return (
		<ScrollArea className="h-[calc(100vh-7rem)]">
			<div className="px-2 py-1 space-y-0.5">
				{teamCharacters.map((character) => (
					<CharacterItem key={character.id} character={character} />
				))}
			</div>
		</ScrollArea>
	);
}

export default function Encounter() {
	const state = useLoaderData<typeof loader>();

	if (!state) {
		return <div>Loading...</div>;
	}

	return (
		<div className="h-screen flex flex-col bg-gray-50">
			{/* Header */}
			<header className="bg-white border-b shrink-0">
				<div className="max-w-[1920px] mx-auto px-4 py-2">
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-3">
							<Link to="/">
								<Button variant="ghost" size="sm">
									← Back
								</Button>
							</Link>
							<h1 className="text-lg font-semibold text-gray-900">{state.name}</h1>
						</div>
						<div className="flex items-center gap-4">
							<p className="text-sm text-gray-500">
								{state.status} {state.status === 'IN_PROGRESS' && `• Round ${state.round}`}
							</p>
							{state.status === 'PREPARING' && <Button size="sm">Start Encounter</Button>}
						</div>
					</div>
				</div>
			</header>

			{/* Main Content */}
			<main className="flex-1 overflow-hidden">
				<div className="h-full max-w-[1920px] mx-auto px-4 py-4">
					<div className="grid h-full grid-cols-[250px_1fr_250px] gap-4">
						{/* Party Sidebar */}
						<Card className="overflow-hidden">
							<CardHeader className="py-2 px-4 border-b">
								<h2 className="text-sm font-semibold text-blue-600">Party Members</h2>
							</CardHeader>
							<CardContent className="p-0">
								<CharacterList characters={state.characters} team="Party" />
							</CardContent>
						</Card>

						{/* Battlefield */}
						<Card className="overflow-hidden">
							<CardHeader className="py-2 px-4 border-b">
								<h2 className="text-sm font-semibold">Battlefield</h2>
							</CardHeader>
							<CardContent className="p-2 h-full">
								<BattleMap state={state} />
							</CardContent>
						</Card>

						{/* Enemies Sidebar */}
						<Card className="overflow-hidden">
							<CardHeader className="py-2 px-4 border-b">
								<h2 className="text-sm font-semibold text-red-600">Enemies</h2>
							</CardHeader>
							<CardContent className="p-0">
								<CharacterList characters={state.characters} team="Enemies" />
							</CardContent>
						</Card>
					</div>
				</div>
			</main>
		</div>
	);
}
