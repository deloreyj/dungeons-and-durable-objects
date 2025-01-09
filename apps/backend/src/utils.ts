import { Race, CharacterClass, ArmorData, SavingThrows, Skills, SkillModifier, Action } from './types';

export const calculateProficiencyBonus = (level: number): number => {
	return Math.floor((level - 1) / 4) + 2;
};

/**
 * Gets movement speed based on character race
 * @param race Character's race
 * @returns Base movement speed in feet
 */
export const getMovementSpeed = (race: Race) => {
	switch (race) {
		case 'Human':
			return 30;
		case 'Elf':
			return 30;
		case 'Dwarf':
			return 25;
		case 'Halfling':
			return 25;
		case 'Gnome':
			return 25;
		case 'Half-Elf':
			return 30;
		case 'Half-Orc':
			return 30;
		case 'Tiefling':
			return 30;
		default:
			throw new Error(`Unknown race: ${race}`);
	}
};

/**
 * Gets hit die type based on character class
 * @param characterClass The character's class
 * @returns Hit die value (e.g., 12 for d12)
 */
export const getHitDice = (characterClass?: CharacterClass) => {
	switch (characterClass) {
		case 'Barbarian':
			return 12;
		case 'Bard':
			return 8;
		case 'Cleric':
			return 8;
		case 'Druid':
			return 8;
		case 'Fighter':
			return 10;
		case 'Monk':
			return 8;
		case 'Paladin':
			return 10;
		case 'Rogue':
			return 8;
		case 'Sorcerer':
			return 6;
		case 'Warlock':
			return 8;
		case 'Wizard':
			return 6;
		case 'Ranger':
			return 10;
		default:
			throw new Error(`Unknown character class: ${characterClass}`);
	}
};

/**
 * Calculates ability score modifier using D&D 5e formula
 * @param stat The ability score value
 * @returns The calculated modifier
 */
export const getModifier = (stat: number) => {
	return Math.floor((stat - 10) / 2);
};

/**
 * Generates random ability scores using 4d6 drop lowest method
 * @returns Object containing all ability scores
 */
export const randomizeStats = () => {
	const rollStat = () => {
		const rolls = Array.from({ length: 4 }, () => Math.floor(Math.random() * 6) + 1);
		return rolls
			.sort((a, b) => a - b)
			.slice(1)
			.reduce((sum, roll) => sum + roll, 0);
	};

	return {
		strength: rollStat(),
		dexterity: rollStat(),
		constitution: rollStat(),
		intelligence: rollStat(),
		wisdom: rollStat(),
		charisma: rollStat(),
	};
};

/**
 * Determines starting armor based on character class
 * @param characterClass The character's class
 * @returns Starting armor configuration
 */
export const getStartingArmor = (characterClass?: CharacterClass): ArmorData => {
	switch (characterClass) {
		case 'Fighter':
		case 'Paladin':
			return { type: 'heavy', baseAC: 16, isShieldEquipped: false, magicBonus: 0, name: 'Chain Mail', requiresStrength: 13 };
		case 'Cleric':
			return { type: 'medium', baseAC: 14, isShieldEquipped: true, magicBonus: 0, name: 'Scale Mail' };
		case 'Druid':
		case 'Monk':
			return { type: 'none', baseAC: 10, isShieldEquipped: false, magicBonus: 0, name: 'No Armor' }; // Monks get Unarmored Defense, Druids avoid metal
		case 'Ranger':
			return { type: 'medium', baseAC: 14, isShieldEquipped: false, magicBonus: 0, name: 'Scale Mail' };
		case 'Rogue':
			return { type: 'light', baseAC: 11, isShieldEquipped: false, magicBonus: 0, name: 'Leather Armor' };
		case 'Barbarian':
			return { type: 'none', baseAC: 10, isShieldEquipped: false, magicBonus: 0, name: 'No Armor' }; // Barbarians get Unarmored Defense
		case 'Bard':
		case 'Warlock':
			return { type: 'light', baseAC: 11, isShieldEquipped: false, magicBonus: 0, name: 'Leather Armor' };
		case 'Sorcerer':
		case 'Wizard':
			return { type: 'none', baseAC: 10, isShieldEquipped: false, magicBonus: 0, name: 'No Armor' };
		default:
			return { type: 'none', baseAC: 10, isShieldEquipped: false, magicBonus: 0, name: 'No Armor' };
	}
};

/**
 * Determines saving throw proficiencies based on class
 * @param characterClass The character's class
 * @returns Object containing saving throw proficiencies
 */
export const getClassSavingThrows = (characterClass?: CharacterClass): SavingThrows => {
	const base = {
		strength: false,
		dexterity: false,
		constitution: false,
		intelligence: false,
		wisdom: false,
		charisma: false,
	};

	switch (characterClass) {
		case 'Barbarian':
			return { ...base, strength: true, constitution: true };
		case 'Bard':
			return { ...base, dexterity: true, charisma: true };
		case 'Cleric':
			return { ...base, wisdom: true, charisma: true };
		case 'Druid':
			return { ...base, intelligence: true, wisdom: true };
		case 'Fighter':
			return { ...base, strength: true, constitution: true };
		case 'Monk':
			return { ...base, strength: true, dexterity: true };
		case 'Paladin':
			return { ...base, wisdom: true, charisma: true };
		case 'Ranger':
			return { ...base, strength: true, dexterity: true };
		case 'Rogue':
			return { ...base, dexterity: true, intelligence: true };
		case 'Sorcerer':
			return { ...base, constitution: true, charisma: true };
		case 'Warlock':
			return { ...base, wisdom: true, charisma: true };
		case 'Wizard':
			return { ...base, intelligence: true, wisdom: true };
		default:
			return base;
	}
};

export const calculateSkillCheck = (abilityScore: number, skill: { proficient: boolean; modifier?: SkillModifier }, level: number) => {
	// If there's an override, use that instead of normal calculation
	if (skill.modifier?.type === 'override') {
		return skill.modifier.value;
	}

	const abilityModifier = getModifier(abilityScore);
	const proficiencyBonus = calculateProficiencyBonus(level);
	const baseTotal = abilityModifier + (skill.proficient ? proficiencyBonus : 0);

	// Add any bonus modifiers
	return baseTotal + (skill.modifier?.type === 'bonus' ? skill.modifier.value : 0);
};

export const getDefaultSkills = (): Skills => ({
	acrobatics: { proficient: false },
	animalHandling: { proficient: false },
	arcana: { proficient: false },
	athletics: { proficient: false },
	deception: { proficient: false },
	history: { proficient: false },
	insight: { proficient: false },
	intimidation: { proficient: false },
	investigation: { proficient: false },
	medicine: { proficient: false },
	nature: { proficient: false },
	perception: { proficient: false },
	performance: { proficient: false },
	persuasion: { proficient: false },
	religion: { proficient: false },
	sleightOfHand: { proficient: false },
	stealth: { proficient: false },
	survival: { proficient: false },
});

export const SKILL_ABILITY_MAPPING = {
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
} as const;

type ClassDefaults = {
	proficiencies: {
		armor: string[];
		weapons: string[];
		tools: string[];
		savingThrows: string[];
		skills: string[];
	};
	actions: Action[];
	bonusActions: Action[];
};

export const getClassDefaults = (characterClass?: CharacterClass): ClassDefaults => {
	switch (characterClass) {
		case 'Barbarian':
			return {
				proficiencies: {
					armor: ['light', 'medium', 'shields'],
					weapons: ['simple', 'martial'],
					tools: [],
					savingThrows: ['strength', 'constitution'],
					skills: ['athletics', 'perception'], // Example picks; choose 2 from Athletics, Intimidation, Nature, Perception, Survival
				},
				actions: [
					{
						type: 'weapon',
						name: 'Greataxe',
						attackBonus: 5, // STR mod (+3) + proficiency (+2)
						reach: 5,
						damage: {
							diceCount: 1,
							diceType: 12,
							modifier: 3,
							type: 'slashing',
						},
					},
				],
				bonusActions: [
					{
						type: 'special',
						name: 'Rage',
						description:
							'Enter a rage (bonus action). While raging, you gain advantage on STR checks and STR saving throws, a +2 bonus to melee damage rolls made with STR weapons, and resistance to bludgeoning, piercing, and slashing damage.',
					},
				],
			};

		case 'Bard':
			return {
				proficiencies: {
					armor: ['light'],
					weapons: ['simple', 'hand crossbow', 'longsword', 'rapier', 'shortsword'],
					tools: ['musical instruments (three of your choice)'], // Bards typically get three musical instruments
					savingThrows: ['dexterity', 'charisma'],
					skills: ['performance', 'persuasion', 'acrobatics'], // Bards choose any 3 skills; these are examples
				},
				actions: [
					{
						type: 'weapon',
						name: 'Rapier',
						attackBonus: 4, // DEX mod (+2) + proficiency (+2)
						reach: 5,
						damage: {
							diceCount: 1,
							diceType: 8,
							modifier: 2,
							type: 'piercing',
						},
					},
				],
				bonusActions: [
					{
						type: 'special',
						name: 'Bardic Inspiration',
						description:
							'As a bonus action, grant one creature other than yourself a Bardic Inspiration die (d6). Once within the next 10 minutes, they can add it to one ability check, attack roll, or saving throw.',
					},
				],
			};

		case 'Cleric':
			return {
				proficiencies: {
					armor: ['light', 'medium', 'shields'],
					weapons: ['simple'],
					tools: [],
					savingThrows: ['wisdom', 'charisma'],
					skills: ['religion', 'insight'], // Choose 2 from History, Insight, Medicine, Persuasion, Religion
				},
				actions: [
					{
						type: 'weapon',
						name: 'Mace',
						attackBonus: 4, // STR mod (+2) + proficiency (+2)
						reach: 5,
						damage: {
							diceCount: 1,
							diceType: 6,
							modifier: 2,
							type: 'bludgeoning',
						},
					},
					{
						type: 'special',
						name: 'Sacred Flame',
						description: 'Target must succeed on a DEX saving throw or take 1d8 radiant damage. Range 60 feet.',
						savingThrow: {
							dc: 13,
							ability: 'dexterity',
						},
						damage: {
							diceCount: 1,
							diceType: 8,
							modifier: 0,
							type: 'radiant',
						},
					},
				],
				bonusActions: [],
			};

		case 'Druid':
			return {
				proficiencies: {
					armor: ['light', 'medium', 'shields'],
					weapons: ['club', 'dagger', 'dart', 'javelin', 'mace', 'quarterstaff', 'scimitar', 'sickle', 'sling', 'spear'],
					tools: ['herbalism kit'],
					savingThrows: ['intelligence', 'wisdom'],
					skills: ['nature', 'survival'], // Choose 2 from Arcana, Animal Handling, Insight, Medicine, Nature, Perception, Religion, Survival
				},
				actions: [
					{
						type: 'weapon',
						name: 'Quarterstaff',
						attackBonus: 4, // STR or DEX mod (+2) + proficiency (+2); example uses STR or DEX at +2
						reach: 5,
						damage: {
							diceCount: 1,
							diceType: 6,
							modifier: 2,
							type: 'bludgeoning',
						},
					},
				],
				// Wild Shape is gained at 2nd level, so it's not listed here for a level 1 druid
				bonusActions: [],
			};

		case 'Fighter':
			return {
				proficiencies: {
					armor: ['light', 'medium', 'heavy', 'shields'],
					weapons: ['simple', 'martial'],
					tools: [],
					savingThrows: ['strength', 'constitution'],
					skills: ['athletics', 'intimidation'], // Choose 2 from Acrobatics, Animal Handling, Athletics, History, Insight, Intimidation, Perception, Survival
				},
				actions: [
					{
						type: 'weapon',
						name: 'Longsword',
						attackBonus: 5, // STR mod (+3) + proficiency (+2)
						reach: 5,
						damage: {
							diceCount: 1,
							diceType: 8,
							modifier: 3,
							type: 'slashing',
						},
					},
				],
				bonusActions: [
					{
						type: 'special',
						name: 'Second Wind',
						description: 'Regain hit points equal to 1d10 + your Fighter level. Once per short or long rest.',
					},
				],
			};

		case 'Monk':
			return {
				proficiencies: {
					armor: [],
					weapons: ['simple', 'shortsword'],
					tools: ["artisan's tools or a musical instrument"],
					savingThrows: ['strength', 'dexterity'],
					skills: ['acrobatics', 'stealth'], // Choose 2 from Acrobatics, Athletics, History, Insight, Religion, Stealth
				},
				actions: [
					{
						type: 'weapon',
						name: 'Unarmed Strike',
						attackBonus: 5, // DEX mod (+3) + proficiency (+2)
						reach: 5,
						damage: {
							diceCount: 1,
							diceType: 4,
							modifier: 3,
							type: 'bludgeoning',
						},
					},
				],
				// Flurry of Blows is gained at 2nd level (requires Ki), so it's not listed here for level 1
				bonusActions: [],
			};

		case 'Paladin':
			return {
				proficiencies: {
					armor: ['light', 'medium', 'heavy', 'shields'],
					weapons: ['simple', 'martial'],
					tools: [],
					savingThrows: ['wisdom', 'charisma'],
					skills: ['religion', 'persuasion'], // Choose 2 from Athletics, Insight, Intimidation, Medicine, Persuasion, Religion
				},
				actions: [
					{
						type: 'weapon',
						name: 'Longsword',
						attackBonus: 5, // STR mod (+3) + proficiency (+2)
						reach: 5,
						damage: {
							diceCount: 1,
							diceType: 8,
							modifier: 3,
							type: 'slashing',
						},
					},
				],
				// Divine Smite is gained at 2nd level (requires spell slots), so it's not a bonus action at level 1
				bonusActions: [],
			};

		case 'Ranger':
			return {
				proficiencies: {
					armor: ['light', 'medium', 'shields'],
					weapons: ['simple', 'martial'],
					tools: [],
					savingThrows: ['strength', 'dexterity'],
					skills: ['nature', 'survival'], // Typically choose 3 from Animal Handling, Athletics, Insight, Investigation, Nature, Perception, Stealth, Survival
				},
				actions: [
					{
						type: 'weapon',
						name: 'Longbow',
						attackBonus: 5, // DEX mod (+3) + proficiency (+2)
						reach: 150, // Normal range (150/600)
						damage: {
							diceCount: 1,
							diceType: 8,
							modifier: 3,
							type: 'piercing',
						},
					},
				],
				// Hunter’s Mark is a 1st-level Ranger spell (bonus action), but not automatically known by all Rangers.
				// If you want an example, you could include it; otherwise, it depends on chosen spells at level 1.
				bonusActions: [],
			};

		case 'Rogue':
			return {
				proficiencies: {
					armor: ['light'],
					weapons: ['simple', 'hand crossbow', 'longsword', 'rapier', 'shortsword'],
					tools: ["thieves' tools"],
					savingThrows: ['dexterity', 'intelligence'],
					skills: ['stealth', 'sleightOfHand'], // Choose 4 from the Rogue skill list
				},
				actions: [
					{
						type: 'weapon',
						name: 'Shortsword',
						attackBonus: 5, // DEX mod (+3) + proficiency (+2)
						reach: 5,
						damage: {
							diceCount: 1,
							diceType: 6,
							modifier: 3,
							type: 'piercing',
						},
					},
				],
				// Cunning Action is gained at 2nd level
				bonusActions: [],
			};

		case 'Sorcerer':
			return {
				proficiencies: {
					armor: [],
					weapons: ['dagger', 'dart', 'sling', 'quarterstaff', 'light crossbow'],
					tools: [],
					savingThrows: ['constitution', 'charisma'],
					skills: ['arcana', 'persuasion'], // Choose 2 from Arcana, Deception, Insight, Intimidation, Persuasion, Religion
				},
				actions: [
					{
						type: 'special',
						name: 'Fire Bolt',
						description: 'Make a ranged spell attack; on hit, deals 1d10 fire damage. Range 120 ft.',
						damage: {
							diceCount: 1,
							diceType: 10,
							modifier: 0,
							type: 'fire',
						},
					},
				],
				// Flexible Casting is gained at 2nd level with Font of Magic
				bonusActions: [],
			};

		case 'Warlock':
			return {
				proficiencies: {
					armor: ['light'],
					weapons: ['simple'],
					tools: [],
					savingThrows: ['wisdom', 'charisma'],
					skills: ['arcana', 'deception'], // Choose 2 from Arcana, Deception, History, Intimidation, Investigation, Nature, Religion
				},
				actions: [
					{
						type: 'special',
						name: 'Eldritch Blast',
						description: 'Make a ranged spell attack; on hit, deals 1d10 force damage. Range 120 ft.',
						damage: {
							diceCount: 1,
							diceType: 10,
							modifier: 0,
							type: 'force',
						},
					},
				],
				bonusActions: [],
			};

		case 'Wizard':
			return {
				proficiencies: {
					armor: [],
					weapons: ['dagger', 'dart', 'sling', 'quarterstaff', 'light crossbow'],
					tools: [],
					savingThrows: ['intelligence', 'wisdom'],
					skills: ['arcana', 'investigation'], // Choose 2 from Arcana, History, Insight, Investigation, Medicine, Religion
				},
				actions: [
					{
						type: 'special',
						name: 'Fire Bolt',
						description: 'Make a ranged spell attack; on hit, deals 1d10 fire damage. Range 120 ft.',
						damage: {
							diceCount: 1,
							diceType: 10,
							modifier: 0,
							type: 'fire',
						},
					},
				],
				bonusActions: [],
			};

		default:
			return {
				proficiencies: {
					armor: [],
					weapons: [],
					tools: [],
					savingThrows: [],
					skills: [],
				},
				actions: [],
				bonusActions: [],
			};
	}
};
