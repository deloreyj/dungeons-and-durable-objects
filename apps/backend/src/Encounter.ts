import { DurableObject } from 'cloudflare:workers';
import { CharacterClass, Race, Alignment } from './types';

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

interface EncounterState {
	roundNumber: number;
	currentTurnIndex: number;
	initiativeOrder: string[];
	characters: Map<string, EncounterCharacter>;
	encounterLog: string[];
	name: string;
	encounterDescription: string;
	mapSize: { width: number; height: number };
	map: MapCell[][];
	characterPositions: Map<string, Position>;
}

export class Encounter extends DurableObject<Env> {
	storage: DurableObjectStorage;
	env: Env;

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		this.storage = ctx.storage;
		this.env = env;
	}

	async getEncounterState(): Promise<EncounterState> {
		const state = (await this.storage.list()) as unknown as Map<string, unknown>;
		return Object.fromEntries(state) as unknown as EncounterState;
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
		});
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

		await this.placeCharacter(characterId);

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

		return { success: true };
	}

	async placeCharacter(characterId: string) {
		const characters = (await this.storage.get('characters')) as Record<string, EncounterCharacter>;
		const character = characters[characterId];
		if (!character) {
			throw new Error('Character not found');
		}

		const position = await this.getRandomEmptyPosition(character.team);
		await this.moveCharacter(characterId, position);
	}

	async moveCharacter(characterId: string, newPos: Position): Promise<boolean> {
		if (!(await this.isValidPosition(newPos))) return false;

		const map = (await this.storage.get('map')) as EncounterState['map'];
		const characterPositions = (await this.storage.get('characterPositions')) as Record<string, Position>;

		const currentPos = characterPositions[characterId];
		if (currentPos) {
			map[currentPos.y][currentPos.x].characterId = undefined;
		}

		map[newPos.y][newPos.x].characterId = characterId;
		characterPositions[characterId] = newPos;

		await this.storage.put('map', map);
		await this.storage.put('characterPositions', characterPositions);

		return true;
	}

	async isValidPosition(pos: Position): Promise<boolean> {
		const mapSize = (await this.storage.get('mapSize')) as EncounterState['mapSize'];
		const map = (await this.storage.get('map')) as EncounterState['map'];

		return pos.x >= 0 && pos.x < mapSize.width && pos.y >= 0 && pos.y < mapSize.height && map[pos.y][pos.x].terrain !== TerrainType.WALL;
	}

	private async getRandomEmptyPosition(team: 'Party' | 'Enemies'): Promise<Position> {
		const mapSize = (await this.storage.get('mapSize')) as EncounterState['mapSize'];
		const map = (await this.storage.get('map')) as EncounterState['map'];
		const characterPositions = (await this.storage.get('characterPositions')) as Record<string, Position>;

		// Determine which half of the map to use based on team
		const startX = team === 'Party' ? 0 : Math.floor(mapSize.width / 2);
		const endX = team === 'Party' ? Math.floor(mapSize.width / 2) : mapSize.width;

		let attempts = 0;
		const maxAttempts = 100;

		while (attempts < maxAttempts) {
			const x = startX + Math.floor(Math.random() * (endX - startX));
			const y = Math.floor(Math.random() * mapSize.height);

			// Check if position is empty and valid
			if (
				map[y][x].terrain !== TerrainType.WALL &&
				!map[y][x].characterId &&
				!Object.values(characterPositions).some((pos) => pos.x === x && pos.y === y)
			) {
				return { x, y };
			}
			attempts++;
		}

		// If no position found after max attempts, use first available position
		for (let x = startX; x < endX; x++) {
			for (let y = 0; y < mapSize.height; y++) {
				if (
					map[y][x].terrain !== TerrainType.WALL &&
					!map[y][x].characterId &&
					!Object.values(characterPositions).some((pos) => pos.x === x && pos.y === y)
				) {
					return { x, y };
				}
			}
		}

		throw new Error('No valid position found for character placement');
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

Legend:
P = Party Member
E = Enemy
# = Wall
~ = Water
! = Lava
* = Difficult Terrain
. = Normal Ground

Your Position: (${pos.x}, ${pos.y})
Nearby Characters:
${nearbyCharacters}`;
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

	private async broadcast(message: any) {
		// ... existing broadcast code ...
	}
}
