import { useLoaderData, Link } from '@remix-run/react';
import { json } from '@remix-run/node';
import type { LoaderFunctionArgs } from '@remix-run/node';
import { Card, CardHeader, CardContent } from '~/components/ui/card';
import { Button } from '~/components/ui/button';
import { ScrollArea } from '~/components/ui/scroll-area';
import { WebSocket } from 'partysocket';
import { useEffect, useState, useRef } from 'react';
import { Textarea } from '~/components/ui/textarea';

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

interface ChatMessage {
	id: string;
	characterName: string;
	content: string;
	timestamp: number;
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

	const websocketUrl = `${context.cloudflare.env.WS_BASE_URL}/encounter/${params.id}/ws`;

	const finalData = { ...data, characters: charactersWithImages, websocketUrl };

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

function EncounterChat({ ws }: { ws: WebSocket | null }) {
	const [messages, setMessages] = useState<ChatMessage[]>([]);
	const [message, setMessage] = useState('');
	const [isOpen, setIsOpen] = useState(false);
	const [userName, setUserName] = useState('');
	const [isNameSet, setIsNameSet] = useState(false);
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const scrollAreaRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!ws) return;

		const handleMessage = (event: MessageEvent) => {
			const data = JSON.parse(event.data);
			if (data.type === 'chat') {
				setMessages((prev) => [...prev, data.message]);
				// Scroll to bottom after new message
				setTimeout(() => {
					if (scrollAreaRef.current) {
						scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
					}
				}, 0);
			} else if (data.type === 'chat_history') {
				setMessages(data.messages);
				// Scroll to bottom after loading history
				setTimeout(() => {
					if (scrollAreaRef.current) {
						scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
					}
				}, 0);
			}
		};

		ws.addEventListener('message', handleMessage);
		return () => ws.removeEventListener('message', handleMessage);
	}, [ws]);

	const handleSetName = (e: React.FormEvent) => {
		e.preventDefault();
		if (userName.trim()) {
			setIsNameSet(true);
			// Initialize chat after setting name
			if (ws) {
				ws.send(JSON.stringify({ type: 'initialize_chat' }));
			}
			// Focus textarea after a short delay to ensure it's mounted
			setTimeout(() => {
				textareaRef.current?.focus();
			}, 0);
		}
	};

	const sendMessage = (e?: React.FormEvent) => {
		e?.preventDefault();
		if (!ws || !message.trim() || !isNameSet) return;

		ws.send(
			JSON.stringify({
				type: 'chat',
				content: message,
				userName,
			})
		);
		setMessage('');
	};

	const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			sendMessage();
		}
	};

	return (
		<div className="fixed bottom-4 right-4 z-50">
			<Button onClick={() => setIsOpen(!isOpen)} variant="outline" className="mb-2 w-full">
				{isOpen ? 'Hide' : 'Show'} Encounter Chat
			</Button>
			{isOpen && (
				<Card className="flex flex-col w-[350px] h-[400px]">
					<CardHeader className="py-2 px-4 border-b shrink-0">
						<h2 className="text-sm font-semibold">Chat</h2>
					</CardHeader>
					<CardContent className="p-0 flex flex-col h-[calc(400px-3rem)]">
						{!isNameSet ? (
							<form onSubmit={handleSetName} className="p-4">
								<div className="space-y-4">
									<div className="space-y-2">
										<label htmlFor="userName" className="text-sm font-medium">
											Enter your name to join the chat
										</label>
										<input
											type="text"
											id="userName"
											value={userName}
											onChange={(e) => setUserName(e.target.value)}
											className="w-full px-3 py-2 border rounded-md text-sm"
											placeholder="Your name"
											required
										/>
									</div>
									<Button type="submit" className="w-full">
										Join Chat
									</Button>
								</div>
							</form>
						) : (
							<>
								<div ref={scrollAreaRef} className="flex-1 overflow-y-auto p-4">
									<div className="space-y-4">
										{messages.map((msg) => (
											<div key={msg.id} className="space-y-1">
												<div className="text-sm font-medium">{msg.characterName}</div>
												<div className="text-sm text-gray-600 whitespace-pre-wrap">{msg.content}</div>
											</div>
										))}
									</div>
								</div>
								<div className="p-4 border-t mt-auto">
									<form onSubmit={sendMessage} className="flex gap-2">
										<Textarea
											ref={textareaRef}
											value={message}
											onChange={(e) => setMessage(e.target.value)}
											onKeyDown={handleKeyDown}
											placeholder="Type your message..."
											className="resize-none min-h-[2.5rem] h-[2.5rem]"
											rows={1}
										/>
										<Button type="submit" size="sm">
											Send
										</Button>
									</form>
								</div>
							</>
						)}
					</CardContent>
				</Card>
			)}
		</div>
	);
}

export default function Encounter() {
	const state = useLoaderData<typeof loader>();
	const [ws, setWs] = useState<WebSocket | null>(null);

	useEffect(() => {
		// Only create WebSocket in browser environment
		if (typeof window === 'undefined') return;

		const websocket = new WebSocket(state.websocketUrl);

		websocket.onclose = () => {
			console.log('WebSocket closed');
		};

		websocket.onerror = (error) => {
			console.error('WebSocket error:', error);
		};

		setWs(websocket);

		// Cleanup on unmount
		return () => {
			websocket.close();
		};
	}, [state.websocketUrl]);

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

			{/* Chat Component */}
			<EncounterChat ws={ws} />
		</div>
	);
}
