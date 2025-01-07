import { DurableObject } from 'cloudflare:workers';

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

interface EncounterState {
	roundNumber: number;
	currentTurnIndex: number;
	initiativeOrder: string[];
	characters: Map<string, Character>;
	encounterLog: string[];
	name: string;
	arealDescription: string;
	encounterDescription: string;
	mapSize: { width: number; height: number };
	map: MapCell[][];
	characterPositions: Map<string, Position>;
}

interface Character {
	id: string;
	name: string;
	team: 'Party' | 'Enemies';
}

export class Encounter extends DurableObject<Env> {
	storage: DurableObjectStorage;
	env: Env;

	/**
	 * Constructs a new Workspace instance.
	 * @param {DurableObjectState} ctx - The context for the durable object.
	 * @param {Env} env - The environment variables.
	 */
	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		this.storage = ctx.storage;
		this.env = env;
	}

	async getEncounterState(): Promise<EncounterState> {
		return (await this.storage.list()) as unknown as EncounterState;
	}

	async initializeEncounter(name: string, arealDescription: string, encounterDescription: string) {
		const defaultMapSize = { width: 20, height: 20 };
		const emptyMap = Array(defaultMapSize.height)
			.fill(null)
			.map(() =>
				Array(defaultMapSize.width)
					.fill(null)
					.map(() => ({
						terrain: TerrainType.NORMAL,
						cover: CoverType.NONE,
					}))
			);

		await this.storage.put({
			name,
			arealDescription,
			encounterDescription,
			roundNumber: 0,
			currentTurnIndex: -1,
			initiativeOrder: [],
			characters: new Map(),
			encounterLog: [],
			mapSize: defaultMapSize,
			map: emptyMap,
			characterPositions: new Map(),
		});
	}

	async getAllCharacterDistances(characterId: string): Promise<Map<string, number>> {
		const distances = new Map<string, number>();
		const characterPositions = (await this.storage.get('characterPositions')) as Map<string, Position>;
		const pos1 = characterPositions.get(characterId);

		if (!pos1) return distances;

		for (const [otherId, pos2] of characterPositions.entries()) {
			if (otherId !== characterId) {
				const dx = Math.abs(pos1.x - pos2.x);
				const dy = Math.abs(pos1.y - pos2.y);
				distances.set(otherId, Math.max(dx, dy) * 5);
			}
		}

		return distances;
	}

	async isValidPosition(pos: Position): Promise<boolean> {
		const mapSize = (await this.storage.get('mapSize')) as EncounterState['mapSize'];
		const map = (await this.storage.get('map')) as EncounterState['map'];

		return pos.x >= 0 && pos.x < mapSize.width && pos.y >= 0 && pos.y < mapSize.height && map[pos.y][pos.x].terrain !== TerrainType.WALL;
	}

	async moveCharacter(characterId: string, newPos: Position): Promise<boolean> {
		if (!(await this.isValidPosition(newPos))) return false;

		const map = (await this.storage.get('map')) as EncounterState['map'];
		const characterPositions = (await this.storage.get('characterPositions')) as EncounterState['characterPositions'];

		const currentPos = characterPositions.get(characterId);
		if (currentPos) {
			map[currentPos.y][currentPos.x].characterId = undefined;
		}

		map[newPos.y][newPos.x].characterId = characterId;
		characterPositions.set(characterId, newPos);

		await this.storage.put({
			map,
			characterPositions,
		});

		return true;
	}

	async generateMapString(): Promise<string> {
		const mapSize = (await this.storage.get('mapSize')) as EncounterState['mapSize'];
		const map = (await this.storage.get('map')) as EncounterState['map'];
		const characters = (await this.storage.get('characters')) as EncounterState['characters'];
		const characterPositions = (await this.storage.get('characterPositions')) as EncounterState['characterPositions'];

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
					const character = characters.get(cell.characterId);
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

	async getContextForCharacter(characterId: string): Promise<string> {
		const characters = (await this.storage.get('characters')) as EncounterState['characters'];
		const characterPositions = (await this.storage.get('characterPositions')) as EncounterState['characterPositions'];

		const character = characters.get(characterId);
		if (!character) return '';

		const pos = characterPositions.get(characterId);
		if (!pos) return '';

		const mapString = await this.generateMapString();
		const distances = await this.getAllCharacterDistances(characterId);

		const nearbyCharacters = Array.from(distances.entries())
			.filter(([_, dist]) => dist <= 30)
			.map(([id, dist]) => {
				const other = characters.get(id);
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
}
