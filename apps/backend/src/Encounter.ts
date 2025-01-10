import { DurableObject } from 'cloudflare:workers';
import { CharacterClass, Race, Alignment, AiTextGenerationToolInput } from './types';
import { encounterDMPersona, encounterLifecycle } from './promptHelpers';

interface Position {
	x: number;
	y: number;
}

interface MapCell {
	terrain?: TerrainType;
	characterId?: string;
	difficult?: boolean;
	cover?: CoverType;
}

enum TerrainType {
	NORMAL = 'normal',
	WALL = 'wall',
	DIFFICULT = 'difficult',
	WATER = 'water',
	LAVA = 'lava',
}

enum CoverType {
	NONE = 'none',
	HALF = 'half',
	THREE_QUARTERS = 'three-quarters',
	FULL = 'full',
}

interface EncounterCharacter {
	id: string;
	name: string;
	team: 'Party' | 'Enemies';
	race: Race;
	characterClass: CharacterClass;
}

interface EncounterLogMessage {
	id: string;
	type: 'DM' | 'USER' | 'EVENT';
	content: string;
	timestamp: number;
	proposedFunction?: {
		name: string;
		arguments: Record<string, any>;
	};
	actionData?: {
		type: string;
		x?: number;
		y?: number;
		remainingMovement?: number;
		additionalMovement?: number;
		stealthRoll?: number;
		criticalSuccess?: boolean;
		criticalFailure?: boolean;
		actionName?: string;
		target?: string;
		result?: {
			type: 'attack' | 'special';
			attackRoll?: number;
			isCrit?: boolean;
			isCritFail?: boolean;
			damage?: {
				total: number;
				type: string;
			};
			savingThrow?: {
				dc: number;
				ability: string;
			};
			description?: string;
		};
	};
}

interface EncounterState {
	roundNumber: number;
	currentTurnIndex: number;
	initiativeOrder: string[];
	characters: Record<string, EncounterCharacter>;
	encounterLog: string[];
	name: string;
	encounterDescription: string;
	mapSize: { width: number; height: number };
	map: MapCell[][];
	characterPositions: Record<string, Position>;
	chatMessages: ChatMessage[];
	encounterAgentLog: EncounterLogMessage[];
	status: 'PREPARING' | 'IN_PROGRESS' | 'COMPLETED';
}

interface ChatMessage {
	id: string;
	characterName: string;
	content: string;
	timestamp: number;
}

type SimpleFunctionParameter = {
	type: string;
	description?: string;
};

type SimpleFunction = {
	name: string;
	description: string;
	parameters: {
		type: 'object';
		properties: Record<string, SimpleFunctionParameter>;
		required: string[];
	};
};

export class Encounter extends DurableObject<Env> {
	storage: DurableObjectStorage;
	env: Env;

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		this.storage = ctx.storage;
		this.env = env;
	}

	/* WEBSOCKET STUFF */
	async fetch(request: Request) {
		console.log('Fetching encounter');
		const webSocketPair = new WebSocketPair();
		const [client, server] = Object.values(webSocketPair);
		console.log('Accepting WebSocket');
		this.ctx.acceptWebSocket(server);
		console.log('WebSocket accepted');

		return new Response(null, {
			status: 101,
			webSocket: client,
		});
	}

	async webSocketMessage(ws: WebSocket, message: ArrayBuffer | string) {
		if (typeof message !== 'string') return;

		try {
			const data = JSON.parse(message);

			if (data.type === 'initialize_chat') {
				// Send chat history to the new client
				const chatMessages = ((await this.storage.get('chatMessages')) as ChatMessage[]) || [];
				ws.send(
					JSON.stringify({
						type: 'chat_history',
						messages: chatMessages,
					})
				);
				return;
			}

			if (data.type === 'initialize_encounter_log') {
				// Send encounter log history to the new client
				const encounterLog = ((await this.storage.get('encounterAgentLog')) as EncounterLogMessage[]) || [];
				ws.send(
					JSON.stringify({
						type: 'encounter_log_history',
						messages: encounterLog,
					})
				);
				return;
			}

			if (data.type === 'chat') {
				const chatMessage: ChatMessage = {
					id: crypto.randomUUID(),
					characterName: data.userName,
					content: data.content,
					timestamp: Date.now(),
				};

				// Store and broadcast the original message first
				const chatMessages = ((await this.storage.get('chatMessages')) as ChatMessage[]) || [];
				chatMessages.push(chatMessage);
				await this.storage.put('chatMessages', chatMessages);
				await this.broadcast({
					type: 'chat',
					message: chatMessage,
				});

				// Check for @ mentions
				const mentionRegex = /@([^@\s]+?)(?=[.,!?\s]|$)/g;
				const mentions = data.content.match(mentionRegex);

				if (mentions) {
					console.log('mentions', mentions);
					console.log('Checking for mentions in message:', data.content);
					const characters = ((await this.storage.get('characters')) as Record<string, EncounterCharacter>) || {};

					for (const mention of mentions) {
						console.log('Processing mention:', mention);
						const characterName = mention.slice(1).trim(); // Remove @ symbol and trim whitespace
						const character = Object.values(characters).find((c) => c.name.toLowerCase().includes(characterName.toLowerCase()));
						console.log('Found character:', character);
						if (character) {
							console.log('Character found, generating response');
							// Get character DO and generate response
							const characterDO = this.env.CHARACTERS.get(this.env.CHARACTERS.idFromName(character.id));
							const isEnemy = character.team === 'Enemies';
							const response = await characterDO.generateResponse(data.content, isEnemy);
							console.log('Response generated:', response);
							const responseMessage: ChatMessage = {
								id: crypto.randomUUID(),
								characterName: character.name,
								content: response,
								timestamp: Date.now(),
							};

							// Store and broadcast the response
							const updatedChatMessages = ((await this.storage.get('chatMessages')) as ChatMessage[]) || [];
							updatedChatMessages.push(responseMessage);
							// Keep only last 100 messages
							if (updatedChatMessages.length > 100) {
								updatedChatMessages.shift();
							}
							await this.storage.put('chatMessages', updatedChatMessages);
							await this.broadcast({
								type: 'chat',
								message: responseMessage,
							});
						} else {
							// Character not found, send DM message
							const dmMessage: ChatMessage = {
								id: crypto.randomUUID(),
								characterName: 'Encounter DM',
								content: `Character ${characterName} not found`,
								timestamp: Date.now(),
							};

							const updatedChatMessages = ((await this.storage.get('chatMessages')) as ChatMessage[]) || [];
							updatedChatMessages.push(dmMessage);
							// Keep only last 100 messages
							if (updatedChatMessages.length > 100) {
								updatedChatMessages.shift();
							}
							await this.storage.put('chatMessages', updatedChatMessages);
							await this.broadcast({
								type: 'chat',
								message: dmMessage,
							});
						}
					}
				}
			}

			if (data.type === 'encounter_log') {
				const logMessage: EncounterLogMessage = {
					id: crypto.randomUUID(),
					type: data.messageType,
					content: data.content,
					timestamp: Date.now(),
				};

				const encounterLog = ((await this.storage.get('encounterAgentLog')) as EncounterLogMessage[]) || [];
				encounterLog.push(logMessage);
				await this.storage.put('encounterAgentLog', encounterLog);
				await this.broadcast({
					type: 'encounter_log',
					message: logMessage,
				});

				// Check if this is a response to a proposed action
				if (data.messageType === 'USER') {
					if (data.content.toLowerCase().trim() === 'yes') {
						// Find the most recent DM message with a proposed function
						const lastProposal = [...encounterLog].reverse().find((msg) => msg.type === 'DM' && msg.proposedFunction);

						if (lastProposal?.proposedFunction) {
							await this.execute(lastProposal.id);
						}
					} else {
						// If it's any other message, plan again
						await this.plan();
					}
				}
			}
		} catch (error) {
			console.error('Error processing WebSocket message:', error);
		}
	}

	async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean) {
		// If the client closes the connection, the runtime will invoke the webSocketClose() handler.
		ws.close(code, 'Durable Object is closing WebSocket');
	}

	private async broadcast(message: any) {
		const sockets = this.ctx.getWebSockets();
		const messageStr = JSON.stringify(message);
		sockets.forEach((socket) => {
			try {
				socket.send(messageStr);
			} catch (err) {
				console.error('Error broadcasting message:', err);
			}
		});
	}
	/* END WEBSOCKET STUFF */

	/* HANDLERS AND DATA PROVIDERS */
	async getEncounterState(): Promise<EncounterState> {
		const state = (await this.storage.list()) as unknown as Map<string, unknown>;
		return Object.fromEntries(state) as unknown as EncounterState;
	}

	async broadcastState() {
		const state = await this.getEncounterState();
		await this.broadcast({
			type: 'encounter_state',
			state,
		});
	}

	async initializeEncounter(id: string, name: string, encounterDescription: string) {
		const defaultMapSize = { width: 12, height: 12 };
		const emptyMap = Array(defaultMapSize.height)
			.fill(null)
			.map((_, y) =>
				Array(defaultMapSize.width)
					.fill(null)
					.map((_, x) => {
						// Create a 3-wide winding path
						if (
							(y < 5 && x >= 4 && x <= 6) || // Top section
							(y >= 5 && y < 8 && x >= 3 && x <= 5) || // Middle bend
							(y >= 8 && x >= 2 && x <= 4)
						) {
							// Bottom section
							return {
								terrain: TerrainType.NORMAL,
								cover: CoverType.NONE,
							};
						}

						// Dense thickets on the sides
						return {
							terrain: TerrainType.DIFFICULT,
							cover: CoverType.THREE_QUARTERS,
						};
					})
			);

		// Place dead horses on the trail
		emptyMap[6][3].terrain = TerrainType.DIFFICULT;
		emptyMap[6][4].terrain = TerrainType.DIFFICULT;

		await this.storage.put({
			id,
			name,
			encounterDescription,
			roundNumber: 0,
			currentTurnIndex: -1,
			initiativeOrder: [],
			characters: {},
			encounterLog: [],
			mapSize: defaultMapSize,
			map: emptyMap,
			characterPositions: {},
			status: 'PREPARING',
			chatMessages: [],
			encounterAgentLog: [
				{
					id: crypto.randomUUID(),
					type: 'DM',
					content: `Welcome to ${name}! I am your Encounter DM. I'll help manage this encounter and keep track of everything that happens. Feel free to ask me questions or give me instructions at any time.`,
					timestamp: Date.now(),
				},
			],
		});
		await this.broadcastState();
	}

	async startEncounter() {
		const state = await this.getEncounterState();
		if (state.status !== 'PREPARING') {
			throw new Error('Encounter must be in PREPARING state to start');
		}

		await this.storage.put({
			status: 'IN_PROGRESS',
		});
		await this.broadcastState();

		await this.plan();

		return { success: true };
	}

	async endEncounter() {
		const state = await this.getEncounterState();
		if (state.status !== 'IN_PROGRESS') {
			throw new Error('Encounter must be in IN_PROGRESS state to end');
		}

		await this.storage.put({
			status: 'COMPLETED',
		});

		await this.broadcast({
			type: 'encounter_ended',
		});
		await this.broadcastState();

		return { success: true };
	}

	async registerCharacter(characterId: string, team: 'Party' | 'Enemies') {
		const characterDOId = this.env.CHARACTERS.idFromName(characterId);
		const characterStub = await this.env.CHARACTERS.get(characterDOId);
		const characterInfo = await characterStub.getCharacterState();

		const character: EncounterCharacter = {
			id: characterId,
			name: characterInfo.name,
			team,
			race: characterInfo.race,
			characterClass: characterInfo.characterClass,
		};

		// Get current characters and add the new one
		const characters = ((await this.storage.get('characters')) as Record<string, EncounterCharacter>) || {};
		characters[characterId] = character;
		await this.storage.put('characters', characters);

		await this.broadcast({
			type: 'character_joined',
			character: {
				id: character.id,
				name: character.name,
				team: character.team,
				race: character.race,
				class: character.characterClass,
			},
		});
		await this.broadcastState();

		return { success: true };
	}

	async moveCharacter(characterId: string, newPos: Position): Promise<boolean> {
		if (!(await this.isValidPosition(newPos))) return false;

		const map = (await this.storage.get('map')) as EncounterState['map'];
		const characterPositions = ((await this.storage.get('characterPositions')) || {}) as Record<string, Position>;

		const currentPos = characterPositions[characterId];
		if (currentPos) {
			map[currentPos.y][currentPos.x].characterId = undefined;
		}

		map[newPos.y][newPos.x].characterId = characterId;
		characterPositions[characterId] = newPos;

		await this.storage.put('map', map);
		await this.storage.put('characterPositions', characterPositions);
		await this.broadcastState();

		return true;
	}

	async isValidPosition(pos: Position): Promise<boolean> {
		const mapSize = (await this.storage.get('mapSize')) as EncounterState['mapSize'];
		const map = (await this.storage.get('map')) as EncounterState['map'];

		return pos.x >= 0 && pos.x < mapSize.width && pos.y >= 0 && pos.y < mapSize.height && map[pos.y][pos.x].terrain !== TerrainType.WALL;
	}

	async getAllCharacterDistances(characterId: string): Promise<Record<string, number>> {
		const distances: Record<string, number> = {};
		const characterPositions = (await this.storage.get('characterPositions')) as Record<string, Position>;
		const pos1 = characterPositions[characterId];

		if (!pos1) return distances;

		for (const [otherId, pos2] of Object.entries(characterPositions)) {
			if (otherId !== characterId) {
				const dx = Math.abs(pos1.x - pos2.x);
				const dy = Math.abs(pos1.y - pos2.y);
				distances[otherId] = Math.max(dx, dy) * 5;
			}
		}

		return distances;
	}

	async getContextForCharacter(characterId: string): Promise<string> {
		const characters = (await this.storage.get('characters')) as Record<string, EncounterCharacter>;
		const characterPositions = (await this.storage.get('characterPositions')) as Record<string, Position>;

		const character = characters[characterId];
		if (!character) return '';

		const pos = characterPositions[characterId];
		if (!pos) return '';

		const mapString = await this.generateMapString();
		const distances = await this.getAllCharacterDistances(characterId);

		const nearbyCharacters = Object.entries(distances)
			.filter(([_, dist]) => dist <= 30)
			.map(([id, dist]) => {
				const other = characters[id];
				return `- ${other?.name} (${other?.team}) is ${dist} feet away`;
			})
			.join('\n');

		return `Current Map State:
${mapString}

${this.getMapLegend()}

Your Position: (${pos.x}, ${pos.y})
Nearby Characters:
${nearbyCharacters}

`;
	}

	getMapLegend(): string {
		return `Legend:
P = Party Member
E = Enemy
# = Wall
~ = Water
! = Lava
* = Difficult Terrain
. = Normal Ground`;
	}

	async generateMapString(): Promise<string> {
		const mapSize = (await this.storage.get('mapSize')) as EncounterState['mapSize'];
		const map = (await this.storage.get('map')) as EncounterState['map'];
		const characters = (await this.storage.get('characters')) as Record<string, EncounterCharacter>;

		const mapRows: string[] = [];

		const header = '   ' + [...Array(mapSize.width)].map((_, i) => i.toString().padStart(2)).join('');
		mapRows.push(header);

		for (let y = 0; y < mapSize.height; y++) {
			let row = y.toString().padStart(2) + ' ';

			for (let x = 0; x < mapSize.width; x++) {
				const cell = map[y][x];
				let symbol = '.';

				if (cell.terrain === TerrainType.WALL) symbol = '#';
				if (cell.terrain === TerrainType.WATER) symbol = '~';
				if (cell.terrain === TerrainType.LAVA) symbol = '!';
				if (cell.terrain === TerrainType.DIFFICULT) symbol = '*';

				if (cell.characterId) {
					const character = characters[cell.characterId];
					if (character) {
						symbol = character.team === 'Party' ? 'P' : 'E';
					}
				}

				row += symbol + ' ';
			}
			mapRows.push(row);
		}

		return mapRows.join('\n');
	}

	async getCharacters() {
		const characters = (await this.storage.get('characters')) as Record<string, EncounterCharacter>;
		return Object.values(characters).map((char) => ({
			id: char.id,
			name: char.name,
			team: char.team,
			race: char.race,
			class: char.characterClass,
		}));
	}

	async placeCharacters() {
		const characters = (await this.storage.get('characters')) as Record<string, EncounterCharacter>;

		// Get party and enemy characters
		const partyMembers = Object.entries(characters).filter(([_, char]) => char.team === 'Party');
		const enemies = Object.entries(characters).filter(([_, char]) => char.team === 'Enemies');

		// Place party members in the open path at the top
		const pathPositions = [
			{ x: 4, y: 0 },
			{ x: 5, y: 0 },
			{ x: 6, y: 0 },
			{ x: 4, y: 1 },
			{ x: 5, y: 1 },
			{ x: 6, y: 1 },
			{ x: 4, y: 2 },
			{ x: 5, y: 2 },
			{ x: 6, y: 2 },
		];

		for (let i = 0; i < partyMembers.length; i++) {
			if (i < pathPositions.length) {
				const [id] = partyMembers[i];
				const pos = pathPositions[i];
				console.log('Moving character', id, 'to', pos);
				await this.moveCharacter(id, pos);
			}
		}

		// Place two goblins near dead horses
		const horsePositions = [
			{ x: 3, y: 7 }, // Below first dead horse
			{ x: 4, y: 7 }, // Below second dead horse
		];

		for (let i = 0; i < 2; i++) {
			if (i < enemies.length) {
				const [id] = enemies[i];
				const pos = horsePositions[i];
				console.log('Moving character', id, 'to', pos);
				await this.moveCharacter(id, pos);
			}
		}

		// Place remaining goblins in trees on either side
		const treePositions = [
			{ x: 1, y: 6 }, // Left side of path
			{ x: 7, y: 6 }, // Right side of path
		];

		for (let i = 2; i < enemies.length; i++) {
			const treeIndex = i - 2;
			if (treeIndex < treePositions.length) {
				const [id] = enemies[i];
				const pos = treePositions[treeIndex];
				await this.moveCharacter(id, pos);
			}
		}

		return true;
	}

	async advanceRound() {
		const roundNumber = ((await this.storage.get('roundNumber')) as number) || 0;
		const newRound = roundNumber + 1;
		await this.storage.put('roundNumber', newRound);
		await this.storage.put('currentTurnIndex', 0);

		const logMessage: EncounterLogMessage = {
			id: crypto.randomUUID(),
			type: 'EVENT',
			content: `Round ${newRound} begins!`,
			timestamp: Date.now(),
		};

		const encounterLog = ((await this.storage.get('encounterAgentLog')) as EncounterLogMessage[]) || [];
		encounterLog.push(logMessage);
		await this.storage.put('encounterAgentLog', encounterLog);
		await this.broadcast({
			type: 'encounter_log',
			message: logMessage,
		});

		await this.broadcastState();
		return true;
	}

	async postEncounterNarrative() {
		const state = await this.getEncounterState();
		const characters = await this.getCharacters();

		const prompt = `You are a skilled D&D Dungeon Master. Create an engaging narrative introduction for this encounter. Make it atmospheric and dramatic, but keep it concise (1 paragraph max).

Encounter Description: ${state.encounterDescription}

Characters Present:
${characters.map((char) => `- ${char.name} (${char.race} ${char.class}) - ${char.team}`).join('\n')}

Write the narrative introduction:`;

		const response = (await this.env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
			prompt,
		})) as { response: string };

		if (!response.response) {
			throw new Error('Failed to generate narrative');
		}

		const chatMessage: ChatMessage = {
			id: crypto.randomUUID(),
			characterName: 'Encounter DM',
			content: response.response.trim(),
			timestamp: Date.now(),
		};

		const chatMessages = ((await this.storage.get('chatMessages')) as ChatMessage[]) || [];
		chatMessages.push(chatMessage);
		await this.storage.put('chatMessages', chatMessages);
		await this.broadcast({
			type: 'chat',
			message: chatMessage,
		});

		return true;
	}

	async rollInitiative() {
		const characters = ((await this.storage.get('characters')) as Record<string, EncounterCharacter>) || {};
		const initiatives: Array<{ id: string; initiative: number }> = [];

		// Roll initiative for each character
		for (const [id, character] of Object.entries(characters)) {
			const characterDO = this.env.CHARACTERS.get(this.env.CHARACTERS.idFromName(id));
			const initiative = await characterDO.rollInitiative();
			initiatives.push({ id, initiative });
		}

		// Sort by initiative, highest first
		const initiativeOrder = initiatives.sort((a, b) => b.initiative - a.initiative).map((i) => i.id);

		await this.storage.put('initiativeOrder', initiativeOrder);
		await this.storage.put('currentTurnIndex', 0);
		await this.broadcastState();

		// Log the initiative order
		const initiativeMessage = initiatives
			.sort((a, b) => b.initiative - a.initiative)
			.map((i) => `${characters[i.id].name}: ${i.initiative}`)
			.join('\n');

		const logMessage: EncounterLogMessage = {
			id: crypto.randomUUID(),
			type: 'EVENT',
			content: `Initiative order:\n${initiativeMessage}`,
			timestamp: Date.now(),
		};

		const encounterLog = ((await this.storage.get('encounterAgentLog')) as EncounterLogMessage[]) || [];
		encounterLog.push(logMessage);
		await this.storage.put('encounterAgentLog', encounterLog);
		await this.broadcast({
			type: 'encounter_log',
			message: logMessage,
		});

		return true;
	}

	async getActiveCharacter() {
		const currentTurnIndex = (await this.storage.get('currentTurnIndex')) as number;
		const initiativeOrder = (await this.storage.get('initiativeOrder')) as string[];
		const characters = (await this.storage.get('characters')) as Record<string, EncounterCharacter>;

		if (currentTurnIndex < 0 || currentTurnIndex >= initiativeOrder.length) {
			throw new Error('Invalid turn index');
		}

		const activeCharacterId = initiativeOrder[currentTurnIndex];
		const activeCharacter = characters[activeCharacterId];

		if (!activeCharacter) {
			throw new Error('Character not found');
		}

		return { activeCharacterId, activeCharacter };
	}
	/**
	 * Begin a character's turn by gathering context and triggering their AI
	 */
	async beginTurn() {
		const { activeCharacterId } = await this.getActiveCharacter();

		// Get the character's DO
		const characterDO = this.env.CHARACTERS.get(this.env.CHARACTERS.idFromName(activeCharacterId));

		// Start their turn (resets actions and movement)
		await characterDO.startTurn();
	}

	async promptCharacterToAct() {
		const { activeCharacterId, activeCharacter } = await this.getActiveCharacter();

		// Get detailed context for the character
		const context = await this.getContextForCharacter(activeCharacterId);

		// Add recent events from the encounter log
		const encounterLog = ((await this.storage.get('encounterAgentLog')) as EncounterLogMessage[]) || [];
		const recentEvents = encounterLog
			.slice(-5)
			.map((log) => `[${new Date(log.timestamp).toISOString()}] ${log.type}: ${log.content}`)
			.join('\n');

		// Combine all context
		const fullContext = `
Current Turn: ${activeCharacter.name} (${activeCharacter.characterClass})
Round: ${await this.storage.get('roundNumber')}

Map State:
${context}

Recent Events:
${recentEvents}
`;

		// Get the character's DO
		const characterDO = this.env.CHARACTERS.get(this.env.CHARACTERS.idFromName(activeCharacterId));

		// Trigger the character's AI to plan and execute their turn
		const actionResult = await characterDO.act(fullContext);

		if (actionResult) {
			let actionDescription = '';
			let actionData: EncounterLogMessage['actionData'] = undefined;

			switch (actionResult.type) {
				case 'move':
					actionDescription = `${activeCharacter.name} moves to position (${actionResult.x}, ${actionResult.y}). ${actionResult.remainingMovement} feet of movement remaining.`;
					actionData = {
						type: 'move',
						x: actionResult.x,
						y: actionResult.y,
						remainingMovement: actionResult.remainingMovement,
					};
					break;
				case 'dash':
					actionDescription = `${activeCharacter.name} uses Dash action, gaining ${actionResult.additionalMovement} feet of movement.`;
					actionData = {
						type: 'dash',
						additionalMovement: actionResult.additionalMovement,
						remainingMovement: actionResult.remainingMovement,
					};
					break;
				case 'disengage':
					actionDescription = `${activeCharacter.name} uses Disengage action to avoid opportunity attacks.`;
					actionData = {
						type: 'disengage',
					};
					break;
				case 'hide':
					actionDescription = `${activeCharacter.name} attempts to Hide with a Stealth roll of ${actionResult.stealthRoll}${
						actionResult.criticalSuccess ? ' (Critical Success!)' : ''
					}${actionResult.criticalFailure ? ' (Critical Failure!)' : ''}.`;
					actionData = {
						type: 'hide',
						stealthRoll: actionResult.stealthRoll,
						criticalSuccess: actionResult.criticalSuccess,
						criticalFailure: actionResult.criticalFailure,
					};
					break;
				case 'action':
				case 'bonusAction': {
					const result = actionResult.result;
					if (!result) break;

					if (result.type === 'attack') {
						actionDescription = `${activeCharacter.name} ${
							actionResult.type === 'bonusAction' ? 'uses bonus action to attack' : 'attacks'
						} ${actionResult.target} with ${actionResult.actionName}. Attack roll: ${result.attackRoll}${
							result.isCrit ? ' (Critical Hit!)' : ''
						}${result.isCritFail ? ' (Critical Miss!)' : ''}.${
							result.damage ? ` Damage: ${result.damage.total} ${result.damage.type}` : ''
						}`;
						actionData = {
							type: actionResult.type,
							actionName: actionResult.actionName,
							target: actionResult.target,
							result: {
								type: 'attack',
								attackRoll: result.attackRoll,
								isCrit: result.isCrit,
								isCritFail: result.isCritFail,
								damage: result.damage,
							},
						};
					} else if (result.type === 'special') {
						actionDescription = `${activeCharacter.name} ${actionResult.type === 'bonusAction' ? 'uses bonus action:' : 'uses'} ${
							actionResult.actionName
						}${actionResult.target ? ` on ${actionResult.target}` : ''}.${
							result.savingThrow ? ` DC ${result.savingThrow.dc} ${result.savingThrow.ability} save required.` : ''
						}${result.damage ? ` Damage: ${result.damage.total} ${result.damage.type}` : ''}`;
						actionData = {
							type: actionResult.type,
							actionName: actionResult.actionName,
							target: actionResult.target,
							result: {
								type: 'special',
								savingThrow: result.savingThrow,
								damage: result.damage,
								description: result.description,
							},
						};
					}
					break;
				}
				case 'endTurn':
					actionDescription = `${activeCharacter.name} ends their turn.`;
					actionData = {
						type: 'endTurn',
					};
					break;
			}

			const actionLogMessage: EncounterLogMessage = {
				id: crypto.randomUUID(),
				type: 'EVENT',
				content: actionDescription,
				timestamp: Date.now(),
				actionData,
			};

			encounterLog.push(actionLogMessage);
			await this.storage.put('encounterAgentLog', encounterLog);
			await this.broadcast({
				type: 'encounter_log',
				message: actionLogMessage,
			});
		}
	}

	async narrateAction(action: string) {
		const prompt = `You are a skilled D&D Dungeon Master. Create a brief, vivid narrative description of this action. Keep it to 1-2 sentences and make it dramatic and engaging.

Action: ${action}

Write the narrative description:`;

		const response = (await this.env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
			prompt,
		})) as { response: string };

		if (!response.response) {
			throw new Error('Failed to generate narrative');
		}

		const chatMessage: ChatMessage = {
			id: crypto.randomUUID(),
			characterName: 'Encounter DM',
			content: response.response.trim(),
			timestamp: Date.now(),
		};

		const chatMessages = ((await this.storage.get('chatMessages')) as ChatMessage[]) || [];
		chatMessages.push(chatMessage);
		await this.storage.put('chatMessages', chatMessages);
		await this.broadcast({
			type: 'chat',
			message: chatMessage,
		});
	}
	/* END HANDLERS AND DATA PROVIDERS */

	/* AGENTIC LOOP */
	getSystemPrompt() {
		return `
		### SYSTEM PROMPT ###
		# Persona: ${encounterDMPersona}
		# Encounter Lifecycle: ${encounterLifecycle}
		### END SYSTEM PROMPT ###
		`;
	}

	async getEncounterStatePrompt() {
		const state = await this.getEncounterState();
		const mapString = await this.generateMapString();
		const mapLegend = this.getMapLegend();
		const characters = await this.getCharacters();
		const recentLogs = state.encounterAgentLog || [];
		const activeCharacterId = state.initiativeOrder[state.currentTurnIndex];
		const activeCharacter = characters.find((c) => c.id === activeCharacterId);

		return `
		### ENCOUNTER DESCRIPTION ###
		${state.encounterDescription}
		### END ENCOUNTER DESCRIPTION ###

		### CHARACTER PLACEMENT INSTRUCTIONS ###
		Party characters should initially be placed at the top of the map within the path indicated by cells with no terrain or cover.
		Two of the enemy goblins should be next to the dead horses indicated by the two cells of difficult terrain in the middle of the path.
		The other two enemy goblins should be placed somewhere in the trees.
		### END CHARACTER PLACEMENT INSTRUCTIONS ###

		### CURRENT ENCOUNTER STATE ###
		# Current Encounter State
		Round: ${state.roundNumber}
		Current Turn: ${state.currentTurnIndex} (${activeCharacter ? activeCharacter.name : 'No active character'})
		Initiative Order: ${state.initiativeOrder.join(', ')}

		# Characters
		${characters.map((char) => `- ${char.name} (${char.id}): ${char.team} ${char.class} ${char.race}`).join('\n')}

		# Current Map State
		${mapString}
		${mapLegend}

		# Recent Events
		${recentLogs.map((log) => `[${new Date(log.timestamp).toISOString()}] ${log.type}: ${log.content}`).join('\n')}
		### END CURRENT ENCOUNTER STATE ###
		`;
	}

	async plan() {
		const prompt = `
		${this.getSystemPrompt()}
		
		${await this.getEncounterStatePrompt()}
		
		Plan the next action for the encounter
		`;
		console.log('Prompt:', prompt);
		const AiResponse = (await this.env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
			prompt,
			tools: this.getAvailableFunctions(),
		})) as {
			response?: string;
			tool_calls?: {
				name: string;
				arguments: Record<string, any>;
			}[];
		};

		if (AiResponse.tool_calls?.length) {
			for (const tool_call of AiResponse.tool_calls) {
				const logMessage: EncounterLogMessage = {
					id: crypto.randomUUID(),
					type: 'DM',
					content: `Proposed action: ${tool_call.name} with arguments: ${JSON.stringify(tool_call.arguments)}`,
					timestamp: Date.now(),
					proposedFunction: tool_call,
				};

				const encounterLog = ((await this.storage.get('encounterAgentLog')) as EncounterLogMessage[]) || [];
				encounterLog.push(logMessage);
				await this.storage.put('encounterAgentLog', encounterLog);
				await this.broadcast({
					type: 'encounter_log',
					message: logMessage,
				});
			}
		}
	}

	async execute(logMessageId: string) {
		const encounterLog = ((await this.storage.get('encounterAgentLog')) as EncounterLogMessage[]) || [];
		const logMessage = encounterLog.find((msg) => msg.id === logMessageId);

		if (!logMessage?.proposedFunction) {
			throw new Error('No proposed function found for this log message');
		}

		const { name, arguments: args } = logMessage.proposedFunction;

		// Add acknowledgment message
		const ackMessage: EncounterLogMessage = {
			id: crypto.randomUUID(),
			type: 'DM',
			content: `Understood! I'll execute the ${name} action right away.`,
			timestamp: Date.now(),
		};
		encounterLog.push(ackMessage);
		await this.storage.put('encounterAgentLog', encounterLog);
		await this.broadcast({
			type: 'encounter_log',
			message: ackMessage,
		});

		switch (name) {
			case 'moveCharacter':
				const { characterId, x, y } = args;
				await this.moveCharacter(characterId, { x, y });
				break;
			case 'postEncounterNarrative':
				await this.postEncounterNarrative();
				break;
			case 'rollInitiative':
				await this.rollInitiative();
				break;
			case 'placeCharacters':
				await this.placeCharacters();
				break;
			case 'advanceRound':
				await this.advanceRound();
				break;
			case 'narrateAction':
				await this.narrateAction(args.action);
				break;
			case 'promptCharacterToAct':
				await this.promptCharacterToAct();
				break;
			case 'beginTurn':
				await this.beginTurn();
				break;
			case 'resolveAction':
				await this.resolveAction();
				break;
			case 'advanceTurn':
				await this.advanceTurn();
				break;
			default:
				throw new Error(`Unknown function: ${name}`);
		}

		// Log the execution
		const executionMessage: EncounterLogMessage = {
			id: crypto.randomUUID(),
			type: 'EVENT',
			content: `Executed action: ${name}`,
			timestamp: Date.now(),
		};

		encounterLog.push(executionMessage);
		await this.storage.put('encounterAgentLog', encounterLog);
		await this.broadcast({
			type: 'encounter_log',
			message: executionMessage,
		});

		// Plan next action
		await this.plan();
	}
	/* END AGENTIC LOOP */

	/* FUNCTION CALLING STUFF */
	getAvailableFunctions(): AiTextGenerationToolInput[] {
		return [
			{
				type: 'function',
				function: {
					name: 'moveCharacter',
					description: 'Moves a character to a new position on the map if the position is valid.',
					parameters: {
						type: 'object',
						properties: {
							characterId: { type: 'string', description: 'The ID of the character to move' },
							x: { type: 'number', description: 'The x coordinate to move to' },
							y: { type: 'number', description: 'The y coordinate to move to' },
						},
						required: ['characterId', 'x', 'y'],
					},
				},
			},
			{
				type: 'function',
				function: {
					name: 'placeCharacters',
					description:
						'Places all characters in their initial positions. Party members are placed in the open path at the top, two enemies near the dead horses, and two in the trees.',
					parameters: {
						type: 'object',
						properties: {},
						required: [],
					},
				},
			},
			{
				type: 'function',
				function: {
					name: 'advanceRound',
					description: 'Advances to the next round, resets the turn index to 0, and broadcasts the new round state.',
					parameters: {
						type: 'object',
						properties: {},
						required: [],
					},
				},
			},
			{
				type: 'function',
				function: {
					name: 'advanceTurn',
					description: 'Advances to the next turn in the initiative order. If at the end of the order, advances the round.',
					parameters: {
						type: 'object',
						properties: {},
						required: [],
					},
				},
			},
			{
				type: 'function',
				function: {
					name: 'postEncounterNarrative',
					description: 'Creates and posts a narrative introduction for the encounter in the chat.',
					parameters: {
						type: 'object',
						properties: {},
						required: [],
					},
				},
			},
			{
				type: 'function',
				function: {
					name: 'rollInitiative',
					description: 'Rolls initiative for all characters in the encounter and sets the turn order.',
					parameters: {
						type: 'object',
						properties: {},
						required: [],
					},
				},
			},
			{
				type: 'function',
				function: {
					name: 'beginTurn',
					description:
						"Begins a character's turn by resetting their actions and movement. This is the first thing that should happen when a new turn begins. ",
					parameters: {
						type: 'object',
						properties: {},
						required: [],
					},
				},
			},
			{
				type: 'function',
				function: {
					name: 'promptCharacterToAct',
					description:
						'Prompts the current character to take their turn by providing context and triggering their AI. This will happen in a loop during a Characters turn until they tell us to end turn. After a calling advanceTurn, make sure you beginTurn for the Character before prompting them to act.',
					parameters: {
						type: 'object',
						properties: {},
						required: [],
					},
				},
			},
			{
				type: 'function',
				function: {
					name: 'resolveAction',
					description:
						'ALWAYS RUN THIS IMMEDIATELY AFTER executing promptCharacterToAct. Resolves the effects of thelast action in the encounter log, applying its effects to the game state. This should always be called right after promptCharacterToAct so the effects of their action are applied to the Encounter.',
					parameters: {
						type: 'object',
						properties: {},
						required: [],
					},
				},
			},
			{
				type: 'function',
				function: {
					name: 'narrateAction',
					description:
						'Creates a narrative description of a Characters action and sends it to the encounter chat. This should only be used after both promptCharacterToAct and resolveAction have been called.',
					parameters: {
						type: 'object',
						properties: {
							action: { type: 'string', description: 'The action to narrate' },
						},
						required: ['action'],
					},
				},
			},
		];
	}

	/* END FUNCTION CALLING STUFF */

	async resolveAction() {
		const encounterLog = ((await this.storage.get('encounterAgentLog')) as EncounterLogMessage[]) || [];
		const lastTenMessages = encounterLog.slice(-10);
		const lastAction = lastTenMessages.reverse().find((msg) => msg.actionData);

		if (!lastAction?.actionData) {
			throw new Error('No action to resolve');
		}

		const actionData = lastAction.actionData;
		const { activeCharacterId } = await this.getActiveCharacter();

		switch (actionData.type) {
			case 'move':
				if (typeof actionData.x !== 'number' || typeof actionData.y !== 'number') {
					throw new Error('Invalid move action data');
				}
				await this.moveCharacter(activeCharacterId, { x: actionData.x, y: actionData.y });
				break;

			case 'action':
			case 'bonusAction':
				if (!actionData.result) break;

				if (actionData.result.type === 'attack' && actionData.target) {
					// Apply damage to target if the attack hit
					if (actionData.result.damage && !actionData.result.isCritFail) {
						const targetDO = this.env.CHARACTERS.get(this.env.CHARACTERS.idFromName(actionData.target));
						await targetDO.takeDamage(actionData.result.damage.total);
					}
				}
				break;

			case 'dash':
			case 'disengage':
			case 'hide':
			case 'endTurn':
				// These actions have already been resolved in the Character DO
				break;

			default:
				throw new Error(`Unknown action type: ${actionData.type}`);
		}

		return true;
	}

	async advanceTurn() {
		const currentTurnIndex = (await this.storage.get('currentTurnIndex')) as number;
		const initiativeOrder = (await this.storage.get('initiativeOrder')) as string[];

		// If we're at the end of the initiative order, advance the round
		if (currentTurnIndex >= initiativeOrder.length - 1) {
			await this.advanceRound();
			return;
		}

		// Otherwise, just increment the turn index
		await this.storage.put('currentTurnIndex', currentTurnIndex + 1);
		await this.broadcastState();

		const { activeCharacter } = await this.getActiveCharacter();
		const logMessage: EncounterLogMessage = {
			id: crypto.randomUUID(),
			type: 'EVENT',
			content: `${activeCharacter.name}'s turn begins!`,
			timestamp: Date.now(),
		};

		const encounterLog = ((await this.storage.get('encounterAgentLog')) as EncounterLogMessage[]) || [];
		encounterLog.push(logMessage);
		await this.storage.put('encounterAgentLog', encounterLog);
		await this.broadcast({
			type: 'encounter_log',
			message: logMessage,
		});

		return true;
	}
}
