import { Race, CharacterClass, ArmorData, SavingThrows } from './types';

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
export const getHitDice = (characterClass: CharacterClass) => {
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
export const getStartingArmor = (characterClass: CharacterClass): ArmorData => {
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
export const getClassSavingThrows = (characterClass: CharacterClass): SavingThrows => {
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
