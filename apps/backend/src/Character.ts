import { DurableObject } from 'cloudflare:workers';
import { Encounter } from './Encounter';
import {
	calculateProficiencyBonus,
	getClassSavingThrows,
	getHitDice,
	getModifier,
	getMovementSpeed,
	getStartingArmor,
	randomizeStats,
	getDefaultSkills,
	calculateSkillCheck,
	SKILL_ABILITY_MAPPING,
	getClassDefaults,
} from './utils';
import { CharacterState, Condition, Skills, DamageRoll, Action, TurnState } from './types';
import { characterPersona } from './promptHelpers';

/**
 * Represents a D&D 5e character as a Durable Object
 * Handles character state, combat mechanics, and real-time updates
 */
export class Character extends DurableObject<Env> {
	private connections: Set<WebSocket> = new Set();
	private dmConnection: WebSocket | null = null;
	private playerConnection: WebSocket | null = null;
	private encounterStub: DurableObjectStub<Encounter> | null = null;
	private image: string | null = null;
	private turnState: TurnState | null = null;

	constructor(state: DurableObjectState, env: Env) {
		super(state, env);
	}

	/**
	 * Initializes a new character with basic attributes and starting equipment
	 * @param name Character name
	 * @param backstory Character background story
	 * @param alignment Character's moral and ethical alignment
	 * @param appearance Physical description
	 * @param characterClass D&D class
	 * @param race Character race
	 */
	async initialize(
		name: string,
		backstory: string,
		alignment: CharacterState['alignment'],
		appearance: string,
		race: CharacterState['race'],
		characterClass?: CharacterState['characterClass'],
		stats?: CharacterState['stats'],
		hp?: CharacterState['currentHp'],
		ac?: CharacterState['armor'],
		speed?: CharacterState['speed'],
		skillModifiers?: Partial<Skills>,
		actions?: Action[],
		bonusActions?: Action[],
		playStylePreference?: string
	) {
		const initialStats = stats || (await randomizeStats());
		const initialHp = hp || getHitDice(characterClass) + getModifier(initialStats.constitution);
		const startingArmor = ac || getStartingArmor(characterClass);
		const classDefaults = getClassDefaults(characterClass);

		// Set up skills with proficiencies from class defaults
		const defaultSkills = getDefaultSkills();
		for (const skillName of classDefaults.proficiencies.skills) {
			if (skillName in defaultSkills) {
				defaultSkills[skillName as keyof Skills].proficient = true;
			}
		}
		const skills = {
			...defaultSkills,
			...skillModifiers,
		};

		await this.ctx.storage.put({
			name,
			backstory,
			alignment,
			appearance,
			race,
			characterClass,
			stats: initialStats,
			abilities: [],
			currentHp: initialHp,
			maxHp: initialHp,
			inventory: [],
			conditions: new Set(),
			speed: speed || getMovementSpeed(race),
			initiativeModifier: getModifier(initialStats.dexterity),
			armor: startingArmor,
			savingThrows: getClassSavingThrows(characterClass),
			proficiencyBonus: calculateProficiencyBonus(1),
			level: 1,
			skills,
			image: null,
			actions: actions || classDefaults.actions,
			bonusActions: bonusActions || classDefaults.bonusActions,
			playStylePreference: playStylePreference || 'balanced',
		});
	}

	// COMBAT MECHANICS

	/**
	 * Calculates character's Armor Class based on equipment and modifiers
	 * @returns The total AC value
	 */
	async calculateAC(): Promise<number> {
		const armor = (await this.ctx.storage.get('armor')) as CharacterState['armor'];
		const stats = (await this.ctx.storage.get('stats')) as CharacterState['stats'];

		const dexMod = getModifier(stats.dexterity);

		let ac = armor.baseAC;
		switch (armor.type) {
			case 'none':
				ac += dexMod;
				break;
			case 'light':
				ac += dexMod;
				break;
			case 'medium':
				ac += Math.min(dexMod, 2);
				break;
			// heavy armor uses base AC only
		}

		if (armor.isShieldEquipped) ac += 2;
		ac += armor.magicBonus;

		return ac;
	}

	/**
	 * Performs a saving throw for a given ability
	 * @param ability The ability to make the saving throw with
	 * @returns Object containing roll result and critical status
	 */
	async rollSavingThrow(
		ability: keyof CharacterState['savingThrows']
	): Promise<{ roll: number; critSuccess: boolean; critFailure?: boolean }> {
		const stats = (await this.ctx.storage.get('stats')) as CharacterState['stats'];
		const savingThrows = (await this.ctx.storage.get('savingThrows')) as CharacterState['savingThrows'];
		const proficiencyBonus = (await this.ctx.storage.get('proficiencyBonus')) as CharacterState['proficiencyBonus'];

		const roll = Math.floor(Math.random() * 20) + 1;
		const modifier = getModifier(stats[ability]);
		const bonus = savingThrows[ability] ? proficiencyBonus : 0;
		const total = roll + modifier + bonus;

		return {
			roll: total,
			critSuccess: roll === 20,
			critFailure: roll === 1,
		};
	}

	/**
	 * Rolls initiative for combat
	 * @returns The initiative roll total
	 */
	async rollInitiative(): Promise<number> {
		const initiativeModifier = (await this.ctx.storage.get('initiativeModifier')) as number;
		const roll = Math.floor(Math.random() * 20) + 1;
		const initiativeRoll = roll + initiativeModifier;
		await this.ctx.storage.put('initiativeRoll', initiativeRoll);
		return initiativeRoll;
	}

	/**
	 * Performs an attack action
	 * @param actionName Name of the action to perform
	 * @param target Target of the action (if applicable)
	 * @returns Result of the action
	 */
	async performAction(actionName: string, target?: string) {
		if (!this.turnState || this.turnState.hasUsedAction) {
			throw new Error('No action available');
		}

		const actions = (await this.ctx.storage.get('actions')) as CharacterState['actions'];
		const action = actions.find((a) => a.name === actionName);

		if (!action) throw new Error(`Action ${actionName} not found`);

		// Mark action as used before performing it
		this.turnState.hasUsedAction = true;
		await this.broadcastState();

		if (action.type === 'weapon') {
			const attackRoll = Math.floor(Math.random() * 20) + 1;
			const isCrit = attackRoll === 20;
			const isCritFail = attackRoll === 1;
			const total = attackRoll + action.attackBonus;

			// Calculate damage
			const damage = this.rollDamage(action.damage, isCrit);

			return {
				type: 'attack',
				attackRoll: total,
				damage,
				isCrit,
				isCritFail,
				target,
			};
		}

		if (action.type === 'special') {
			if (action.savingThrow) {
				const dc = action.savingThrow.dc;
				return {
					type: 'special',
					savingThrow: {
						dc,
						ability: action.savingThrow.ability,
					},
					damage: action.damage ? this.rollDamage(action.damage, false) : undefined,
					description: action.description,
					target,
				};
			}

			return {
				type: 'special',
				description: action.description,
				damage: action.damage ? this.rollDamage(action.damage, false) : undefined,
				target,
			};
		}
	}

	/**
	 * Performs a bonus action
	 * @param actionName Name of the bonus action to perform
	 * @param target Target of the action (if applicable)
	 * @returns Result of the bonus action
	 */
	async performBonusAction(actionName: string, target?: string) {
		if (!this.turnState || this.turnState.hasUsedBonusAction) {
			throw new Error('No bonus action available');
		}

		const bonusActions = (await this.ctx.storage.get('bonusActions')) as CharacterState['bonusActions'];
		const action = bonusActions.find((a) => a.name === actionName);

		if (!action) throw new Error(`Bonus action ${actionName} not found`);

		// Mark bonus action as used before performing it
		this.turnState.hasUsedBonusAction = true;
		await this.broadcastState();

		return this.performAction(actionName, target);
	}

	/**
	 * Rolls damage for an attack
	 * @param damageRoll Damage roll configuration
	 * @param isCrit Whether the attack was a critical hit
	 * @returns Total damage and breakdown
	 */
	private rollDamage(damageRoll: DamageRoll, isCrit: boolean) {
		const diceCount = isCrit ? damageRoll.diceCount * 2 : damageRoll.diceCount;
		let total = damageRoll.modifier;

		const rolls: number[] = [];
		for (let i = 0; i < diceCount; i++) {
			rolls.push(Math.floor(Math.random() * damageRoll.diceType) + 1);
		}

		total += rolls.reduce((sum, roll) => sum + roll, 0);

		return {
			total,
			rolls,
			type: damageRoll.type,
			modifier: damageRoll.modifier,
		};
	}

	/**
	 * Adds an action to the character
	 * @param action Action to add
	 */
	async addAction(action: CharacterState['actions'][number]) {
		const actions = (await this.ctx.storage.get('actions')) as CharacterState['actions'];
		actions.push(action);
		await this.ctx.storage.put('actions', actions);
	}

	/**
	 * Adds a bonus action to the character
	 * @param action Bonus action to add
	 */
	async addBonusAction(action: CharacterState['bonusActions'][number]) {
		const bonusActions = (await this.ctx.storage.get('bonusActions')) as CharacterState['bonusActions'];
		bonusActions.push(action);
		await this.ctx.storage.put('bonusActions', bonusActions);
	}

	// HEALTH AND CONDITIONS

	/**
	 * Updates character's hit points and handles unconsciousness
	 * @param amount Amount to change HP (positive for healing, negative for damage)
	 */
	async updateHp(amount: number) {
		const currentHp = (await this.ctx.storage.get('currentHp')) as number;
		const maxHp = (await this.ctx.storage.get('maxHp')) as number;

		const newHp = Math.max(0, Math.min(maxHp, currentHp + amount));
		await this.ctx.storage.put('currentHp', newHp);

		if (newHp === 0) {
			await this.addCondition('Unconscious');
		}

		await this.broadcastState();
	}

	/**
	 * Applies damage to the character
	 * @param amount Amount of damage taken
	 */
	async takeDamage(amount: number) {
		await this.updateHp(-amount);
		const response = await this.generateResponse(`I took ${amount} damage!`);
		await this.broadcastToEncounter(response);
	}

	/**
	 * Heals the character
	 * @param amount Amount of healing received
	 */
	async heal(amount: number) {
		await this.updateHp(amount);
		const response = await this.generateResponse(`I was healed for ${amount} HP!`);
		await this.broadcastToEncounter(response);
	}

	/**
	 * Adds a condition to the character
	 * @param condition The condition to apply
	 */
	async addCondition(condition: Condition) {
		const conditions = (await this.ctx.storage.get('conditions')) as CharacterState['conditions'];
		conditions.add(condition);
		await this.ctx.storage.put('conditions', conditions);
		await this.broadcastState();
	}

	/**
	 * Removes a condition from the character
	 * @param condition The condition to remove
	 */
	async removeCondition(condition: Condition) {
		const conditions = (await this.ctx.storage.get('conditions')) as CharacterState['conditions'];
		conditions.delete(condition);
		await this.ctx.storage.put('conditions', conditions);
		await this.broadcastState();
	}

	// EQUIPMENT AND INVENTORY

	/**
	 * Adds an item to character's inventory
	 * @param item Item to add
	 */
	async addItem(item: string) {
		const inventory = (await this.ctx.storage.get('inventory')) as CharacterState['inventory'];
		inventory.push(item);
		await this.ctx.storage.put('inventory', inventory);
		await this.broadcastState();
	}

	/**
	 * Removes an item from character's inventory
	 * @param item Item to remove
	 */
	async removeItem(item: string) {
		const inventory = (await this.ctx.storage.get('inventory')) as CharacterState['inventory'];
		const index = inventory.indexOf(item);
		if (index > -1) {
			inventory.splice(index, 1);
			await this.ctx.storage.put('inventory', inventory);
			await this.broadcastState();
		}
	}

	// COMMUNICATION AND STATE MANAGEMENT

	/**
	 * Establishes WebSocket connection for real-time updates
	 * @param type Connection type (player, DM, or encounter)
	 * @returns Client WebSocket
	 */
	async connect(type: 'player' | 'dm' | 'encounter'): Promise<WebSocket> {
		const { 0: client, 1: server } = new WebSocketPair();
		await this.handleWebSocket(server, type);
		return client;
	}

	/**
	 * Handles incoming WebSocket messages
	 * @param data Message data
	 * @param source Message source type
	 */
	private async handleMessage(data: string | ArrayBuffer, source: 'player' | 'dm' | 'encounter') {
		const message = JSON.parse(typeof data === 'string' ? data : new TextDecoder().decode(data));

		switch (message.type) {
			case 'chat':
				if (source === 'player') {
					const response = await this.generateResponse(message.content);
					await this.sendToPlayer(response);
				}
				break;

			case 'damage':
				await this.updateHp(-message.amount);
				const response = await this.generateResponse(`I took ${message.amount} damage!`);
				await this.broadcastToEncounter(response);
				break;

			// Add other message type handlers as needed
		}
	}

	/**
	 * Broadcasts state updates to all connected clients
	 */
	private async broadcastState() {
		const state = {
			type: 'state_update',
			data: await this.ctx.storage.list(),
		};

		for (const conn of this.connections) {
			conn.send(JSON.stringify(state));
		}
		if (this.playerConnection) this.playerConnection.send(JSON.stringify(state));
		if (this.dmConnection) this.dmConnection.send(JSON.stringify(state));
	}

	/**
	 * Sends a message to the player's connection
	 * @param message Message to send
	 */
	private async sendToPlayer(message: string) {
		if (this.playerConnection) {
			this.playerConnection.send(
				JSON.stringify({
					type: 'message',
					content: message,
				})
			);
		}
	}

	/**
	 * Handles WebSocket setup and message routing
	 * @param socket WebSocket server instance
	 * @param type Connection type
	 */
	private async handleWebSocket(socket: WebSocket, type: 'player' | 'dm' | 'encounter') {
		socket.accept();

		switch (type) {
			case 'player':
				this.playerConnection = socket;
				break;
			case 'dm':
				this.dmConnection = socket;
				break;
			default:
				this.connections.add(socket);
		}

		socket.addEventListener('message', async (event) => {
			try {
				await this.handleMessage(event.data, type);
			} catch (error) {
				console.error('Error handling message:', error);
			}
		});

		socket.addEventListener('close', () => {
			switch (type) {
				case 'player':
					this.playerConnection = null;
					break;
				case 'dm':
					this.dmConnection = null;
					break;
				default:
					this.connections.delete(socket);
			}
		});

		// Send initial state
		await this.broadcastState();
	}

	/**
	 * Broadcasts a message to the encounter
	 * @param message Message to broadcast
	 */
	private async broadcastToEncounter(message: string) {
		if (this.encounterStub) {
			const id = (await this.ctx.storage.get('id')) as string;
			// Send message to encounter through RPC
			await this.encounterStub.fetch('http://fake/broadcast', {
				method: 'POST',
				body: JSON.stringify({
					type: 'character_message',
					characterId: id,
					content: message,
				}),
			});
		}
	}

	// AI INTEGRATION

	/**
	 * Constructs a prompt for AI responses that includes character context and system instructions
	 * @param state Current character state
	 * @param context Message or situation the character is responding to
	 * @param isEnemy Whether the message is from an enemy
	 * @returns Formatted prompt string
	 */
	private async constructCharacterPrompt(context: string, isEnemy: boolean = false): Promise<string> {
		const systemPrompt = `You are a Dungeons & Dragons character responding to a message in an encounter chat.
Your responses should be short, concise, and in-character - no more than 1-2 sentences. Make your phrasing and tone match your character's race and class.
Still try to be clever and fun. The ultimate goal is the enjoyment of the players.
You may be terse, rude, or friendly depending on your character's personality.${
			isEnemy ? '\nThe message is from an enemy, so you should be hostile or antagonistic in your response.' : ''
		}
Never break character or acknowledge you are an AI.
Never use markdown or formatting.
Respond directly as your character would in this situation.`;

		return `${systemPrompt}

${await this.getCharacterContext()}

Player Message: ${context}

Response:`;
	}

	async getCharacterContext() {
		const state = await this.getCharacterState();
		return `Character Context:
Name: ${state.name}
Race: ${state.race}
Class: ${state.characterClass || 'Unknown'}
Alignment: ${state.alignment}
Current HP: ${state.currentHp}/${state.maxHp}
Conditions: ${Array.from(state.conditions).join(', ') || 'None'}
Backstory: ${state.backstory}
Personality: ${state.playStylePreference || 'balanced'}`;
	}

	/**
	 * Generates AI response based on character personality
	 * @param context Message or situation context
	 * @param isEnemy Whether the message is from an enemy
	 * @returns Generated response
	 */
	async generateResponse(context: string, isEnemy: boolean = false): Promise<string> {
		const prompt = await this.constructCharacterPrompt(context, isEnemy);
		const AIResponse = (await this.env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
			prompt,
		})) as {
			response?: string;
			tool_calls?: {
				name: string;
				arguments: unknown;
			}[];
		};
		if (!AIResponse.response) throw new Error('No response from AI');
		return AIResponse.response;
	}

	async setImage(imageKey: string) {
		console.log('Setting image key', imageKey);
		await this.ctx.storage.put('imageKey', imageKey);
	}

	async getImage() {
		const imageKey = (await this.ctx.storage.get('imageKey')) as string | null;
		return imageKey;
	}

	// STATE QUERIES

	/**
	 * Retrieves current character stats
	 * @returns Object containing current stats and conditions
	 */
	async getCharacterState(): Promise<CharacterState> {
		const state = (await this.ctx.storage.list()) as Map<string, unknown>;
		const stateObject = Object.fromEntries(state);
		return stateObject as CharacterState;
	}

	/**
	 * Makes a skill check for a given skill
	 * @param skillName The name of the skill to check
	 * @returns Object containing roll result and critical status
	 */
	async rollSkillCheck(
		skillName: keyof typeof SKILL_ABILITY_MAPPING
	): Promise<{ roll: number; critSuccess: boolean; critFailure: boolean }> {
		const stats = (await this.ctx.storage.get('stats')) as CharacterState['stats'];
		const skills = (await this.ctx.storage.get('skills')) as CharacterState['skills'];
		const level = (await this.ctx.storage.get('level')) as number;

		const abilityName = SKILL_ABILITY_MAPPING[skillName];
		const abilityScore = stats[abilityName];
		const skill = skills[skillName];

		const d20Roll = Math.floor(Math.random() * 20) + 1;
		const total = calculateSkillCheck(abilityScore, skill, level);

		return {
			roll: d20Roll + total,
			critSuccess: d20Roll === 20,
			critFailure: d20Roll === 1,
		};
	}

	/* AGENTIC STUFF */
	async act(context: string) {
		const action = await this.plan(context);
		if (!action) return null;
		return await this.execute(action);
	}

	async execute(action: { name: string; arguments: Record<string, any> }) {
		if (!this.turnState) {
			throw new Error('No turn in progress');
		}

		switch (action.name) {
			case 'move':
				return {
					type: 'move',
					x: action.arguments.x,
					y: action.arguments.y,
					remainingMovement: this.turnState.remainingMovement,
				};

			case 'dash':
				const dashResult = await this.dash();
				return {
					type: 'dash',
					additionalMovement: dashResult.additionalMovement,
					remainingMovement: this.turnState.remainingMovement,
				};

			case 'disengage':
				await this.disengage();
				return {
					type: 'disengage',
				};

			case 'hide':
				const hideResult = await this.hide();
				return {
					type: 'hide',
					stealthRoll: hideResult.stealthRoll,
					criticalSuccess: hideResult.criticalSuccess,
					criticalFailure: hideResult.criticalFailure,
				};

			case 'endTurn':
				await this.endTurn();
				return {
					type: 'endTurn',
				};

			default:
				// Handle character-specific actions and bonus actions
				if (this.turnState.hasUsedAction) {
					const result = await this.performBonusAction(action.name, action.arguments.target);
					return {
						type: 'bonusAction',
						actionName: action.name,
						target: action.arguments.target,
						result,
					};
				} else {
					const result = await this.performAction(action.name, action.arguments.target);
					return {
						type: 'action',
						actionName: action.name,
						target: action.arguments.target,
						result,
					};
				}
		}
	}

	async endTurn() {
		this.turnState = null;
		await this.broadcastState();
	}

	async getAvailableFunctions() {
		type FunctionDef = {
			type: 'function';
			function: {
				name: string;
				description: string;
				parameters: {
					type: 'object';
					properties: Record<string, unknown>;
					required: string[];
				};
			};
		};

		const functions: FunctionDef[] = [
			{
				type: 'function',
				function: {
					name: 'endTurn',
					description: 'End your turn, resetting all actions and movement for the next turn',
					parameters: {
						type: 'object',
						properties: {},
						required: [],
					},
				},
			},
		];

		// Add action-based abilities if action is available
		if (this.turnState && !this.turnState.hasUsedAction) {
			// Add standard actions
			functions.push(
				{
					type: 'function',
					function: {
						name: 'dash',
						description: 'Use your action to move up to your speed a second time',
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
						name: 'disengage',
						description: 'Use your action to prevent opportunity attacks when moving away from enemies',
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
						name: 'hide',
						description: 'Use your action to make a Dexterity (Stealth) check to attempt to hide',
						parameters: {
							type: 'object',
							properties: {},
							required: [],
						},
					},
				}
			);

			// Add character-specific actions
			const actions = (await this.ctx.storage.get('actions')) as CharacterState['actions'];
			for (const action of actions) {
				functions.push({
					type: 'function',
					function: {
						name: action.name,
						description: action.type === 'special' ? action.description : `Attack with ${action.name}`,
						parameters: {
							type: 'object',
							properties:
								action.type === 'weapon'
									? {
											target: { type: 'string', description: 'The target of the attack' },
									  }
									: {},
							required: action.type === 'weapon' ? ['target'] : [],
						},
					},
				});
			}
		}

		// Add bonus actions if they're available
		if (this.turnState && !this.turnState.hasUsedBonusAction) {
			const bonusActions = (await this.ctx.storage.get('bonusActions')) as CharacterState['bonusActions'];
			for (const action of bonusActions) {
				functions.push({
					type: 'function',
					function: {
						name: action.name,
						description: action.type === 'special' ? action.description : `Bonus Action: ${action.name}`,
						parameters: {
							type: 'object',
							properties:
								action.type === 'weapon'
									? {
											target: { type: 'string', description: 'The target of the attack' },
									  }
									: {},
							required: action.type === 'weapon' ? ['target'] : [],
						},
					},
				});
			}
		}

		// Only add move if we have movement remaining
		if (this.turnState?.remainingMovement && this.turnState.remainingMovement > 0) {
			functions.push({
				type: 'function',
				function: {
					name: 'move',
					description: 'Move to a new position on the map, using up movement speed',
					parameters: {
						type: 'object',
						properties: {
							x: { type: 'number', description: 'The x coordinate to move to' },
							y: { type: 'number', description: 'The y coordinate to move to' },
						},
						required: ['x', 'y'],
					},
				},
			});
		}

		return functions;
	}
	/* END AGENTIC STUFF */

	/**
	 * Starts a new turn for the character, resetting their available actions
	 */
	async startTurn() {
		const speed = (await this.ctx.storage.get('speed')) as number;
		this.turnState = {
			hasUsedAction: false,
			hasUsedBonusAction: false,
			remainingMovement: speed,
		};
		await this.broadcastState();
	}

	/**
	 * Updates the character's remaining movement
	 * @param distance Distance moved (in feet)
	 * @returns Whether the movement was allowed
	 */
	async useMovement(distance: number): Promise<boolean> {
		if (!this.turnState) return false;
		if (distance > this.turnState.remainingMovement) return false;

		this.turnState.remainingMovement -= distance;
		await this.broadcastState();
		return true;
	}

	/**
	 * Gets the character's current actions and remaining movement
	 */
	async getTurnState(): Promise<TurnState | null> {
		return this.turnState;
	}
	/* END AGENTIC STUFF */

	/**
	 * Use the Dash action to move up to your speed a second time
	 */
	async dash() {
		if (!this.turnState || this.turnState.hasUsedAction) {
			throw new Error('No action available');
		}

		const speed = (await this.ctx.storage.get('speed')) as number;
		this.turnState.remainingMovement += speed;
		this.turnState.hasUsedAction = true;
		await this.broadcastState();

		return {
			type: 'dash',
			additionalMovement: speed,
		};
	}

	/**
	 * Use the Disengage action to prevent opportunity attacks
	 */
	async disengage() {
		if (!this.turnState || this.turnState.hasUsedAction) {
			throw new Error('No action available');
		}

		this.turnState.hasUsedAction = true;
		await this.broadcastState();

		return {
			type: 'disengage',
			effect: 'Movement no longer provokes opportunity attacks this turn',
		};
	}

	/**
	 * Use the Hide action to attempt to hide from enemies
	 */
	async hide() {
		if (!this.turnState || this.turnState.hasUsedAction) {
			throw new Error('No action available');
		}

		const stealthCheck = await this.rollSkillCheck('stealth');
		this.turnState.hasUsedAction = true;
		await this.broadcastState();

		return {
			type: 'hide',
			stealthRoll: stealthCheck.roll,
			criticalSuccess: stealthCheck.critSuccess,
			criticalFailure: stealthCheck.critFailure,
		};
	}

	/**
	 * Move to a new position on the map
	 * @param x The x coordinate to move to
	 * @param y The y coordinate to move to
	 * @returns Result of the movement attempt
	 */
	async move(x: number, y: number) {
		if (!this.turnState) {
			throw new Error('No turn in progress');
		}

		if (!this.encounterStub) {
			throw new Error('Not in an encounter');
		}

		// Calculate distance to new position
		const currentPosition = (await this.encounterStub
			.fetch('http://fake/getPosition', {
				method: 'POST',
				body: JSON.stringify({ characterId: await this.ctx.storage.get('id') }),
			})
			.then((r) => r.json())) as { x: number; y: number };

		const dx = Math.abs(currentPosition.x - x);
		const dy = Math.abs(currentPosition.y - y);
		const distance = Math.max(dx, dy) * 5; // Convert grid squares to feet

		if (distance > this.turnState.remainingMovement) {
			throw new Error('Not enough movement remaining');
		}

		// Try to move to the new position
		const success = (await this.encounterStub
			.fetch('http://fake/moveCharacter', {
				method: 'POST',
				body: JSON.stringify({
					characterId: await this.ctx.storage.get('id'),
					newPos: { x, y },
				}),
			})
			.then((r) => r.json())) as boolean;

		if (success) {
			await this.useMovement(distance);
			return {
				type: 'move',
				distance,
				newPosition: { x, y },
				remainingMovement: this.turnState.remainingMovement,
			};
		} else {
			throw new Error('Invalid movement target');
		}
	}

	async plan(context: string): Promise<{ name: string; arguments: Record<string, any> } | null> {
		const state = await this.getCharacterState();
		const availableFunctions = await this.getAvailableFunctions();

		const prompt = `
${characterPersona}

Character Context:
Name: ${state.name}
Race: ${state.race}
Class: ${state.characterClass}
Alignment: ${state.alignment}
Current HP: ${state.currentHp}/${state.maxHp}
Conditions: ${Array.from(state.conditions).join(', ') || 'None'}
Play Style: ${state.playStylePreference || 'balanced'}

Encounter Context:
${context}

Turn State:
${
	this.turnState
		? `
- Action ${this.turnState.hasUsedAction ? 'used' : 'available'}
- Bonus Action ${this.turnState.hasUsedBonusAction ? 'used' : 'available'}
- Movement remaining: ${this.turnState.remainingMovement} feet`
		: 'No turn in progress'
}

Choose your next action based on the available options and the current situation. Consider:
1. Tactical positioning and movement
2. Enemy positions and distances
3. Available actions and their effectiveness
4. Your character's play style and personality
5. Recent events and their impact

Respond with a function call that best serves your character's goals.`;

		console.log('Prompting AI with:', prompt);

		const response = (await this.env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
			prompt,
			tools: availableFunctions as any, // Type system doesn't fully match Cloudflare's AI type expectations
		})) as {
			response?: string;
			tool_calls?: Array<{
				name: string;
				arguments: Record<string, any>;
			}>;
		};

		if (!response.tool_calls?.length) {
			return null;
		}

		return response.tool_calls[0];
	}
}
