import { DurableObjectState } from '@cloudflare/workers-types';
import {
	Ability,
	AbilityIndex,
	CharacterJSON,
	Race,
	SkillIndex,
	SkillNameToStatNameMap,
	SkillProficiencySet,
	StatIndex,
	StatName,
} from './types';
import { DurableObject } from 'cloudflare:workers';

export class Character extends DurableObject<Env> {
	name: string;
	alignment: string;
	stats: StatIndex;
	backStory: string;
	abilities: AbilityIndex;
	hitPoints: number;
	movementSpeed: number;
	physicalDescription?: string;
	proficiencyBonus: number;
	skills: SkillIndex;

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		this.name = '';
		this.alignment = '';
		this.stats = {};
		this.backStory = '';
		this.abilities = {};
		this.hitPoints = 0;
		this.movementSpeed = 0;
		this.physicalDescription = '';
		this.proficiencyBonus = 2;
		this.skills = {};
	}

	initialize(
		name: string,
		alignment: string,
		stats: StatIndex,
		backStory: string,
		abilities: AbilityIndex,
		hitPoints: number,
		movementSpeed: number,
		physicalDescription?: string,
		proficiencyBonus?: number,
		skillProficiencies?: SkillProficiencySet
	) {
		this.name = name;
		this.alignment = alignment;
		this.backStory = backStory;
		this.abilities = abilities;
		this.hitPoints = hitPoints;
		this.movementSpeed = movementSpeed;
		this.physicalDescription = physicalDescription || '';
		if (proficiencyBonus) {
			this.proficiencyBonus = proficiencyBonus;
		} else {
			this.proficiencyBonus = 2;
		}

		if (Object.keys(stats).length === 0) {
			this.randomizeStats(skillProficiencies);
		} else {
			this.updateStatsAndSkills(stats, skillProficiencies);
		}
	}

	toJSON() {
		return {
			name: this.name,
			alignment: this.alignment,
			stats: this.stats,
			backStory: this.backStory,
			abilities: this.abilities,
			hitPoints: this.hitPoints,
			movementSpeed: this.movementSpeed,
			proficiencyBonus: this.proficiencyBonus,
			skills: this.skills,
			physicalDescription: this.physicalDescription,
		};
	}

	async getImage() {
		const inputs = {
			prompt: `Dungeons and Dragons character named ${this.name} 
       Physical description: ${this.physicalDescription} 
       Alignment: ${this.alignment}`,
		};

		const response = await this.env.AI.run('@cf/bytedance/stable-diffusion-xl-lightning', inputs);

		return response;
	}

	takeDamage(amount: number) {
		this.hitPoints -= amount;
	}

	heal(amount: number) {
		this.hitPoints += amount;
	}

	addAbility(ability: Ability) {
		this.abilities[ability.name] = ability;
	}

	removeAbility(name: string) {
		delete this.abilities[name];
	}

	updateStatsAndSkills(newStats: StatIndex, skillProficiencies?: SkillProficiencySet) {
		this.stats = { ...this.stats, ...newStats };
		//for each skill in our map
		for (const skillName in SkillNameToStatNameMap) {
			//get the key from the map
			const skillNameKey = skillName as keyof typeof SkillNameToStatNameMap;

			//we need to calculate proficiency and modify the value up front so we can set both later
			const isProficient = (skillProficiencies && Object.keys(skillProficiencies).includes(skillNameKey)) as boolean;
			const drivingStatBonus = this.stats[SkillNameToStatNameMap[skillNameKey]].bonus;
			const skillBonus = isProficient ? drivingStatBonus + this.proficiencyBonus : drivingStatBonus;

			//set the skill in the skills index based on the proper stat
			this.skills[skillNameKey] = {
				//define the driving stat based on the map
				drivingStat: SkillNameToStatNameMap[skillNameKey],
				proficient: isProficient,
				value: skillBonus,
				passiveValue: skillBonus + 10,
			};
		}
	}

	move(distance: number) {
		// TODO: Implement the logic for moving the character
		console.log(`${this.name} moves ${distance} units at a speed of ${this.movementSpeed}.`);
	}

	updateProficiencyBonus(proficiencyBonus: number) {
		this.proficiencyBonus = proficiencyBonus;
	}

	// randomizeStats(skillProficiencies?: SkillProficiencySet) {
	// 	const roll4d6DropWorst = () => {
	// 		const minRoll = Math.min(...rolls);
	// 		return rolls.reduce((accumulator, currentValue) => accumulator + currentValue, 0) - minRoll;
	// 	};
	// 	const randomizedStats: StatIndex = {
	// 		[StatName.STR]: { raw: 10, bonus: 0 },
	// 		[StatName.DEX]: { raw: 10, bonus: 0 },
	// 		[StatName.CON]: { raw: 10, bonus: 0 },
	// 		[StatName.INT]: { raw: 10, bonus: 0 },
	// 		[StatName.WIS]: { raw: 10, bonus: 0 },
	// 		[StatName.CHA]: { raw: 10, bonus: 0 },
	// 	};

	// 	for (const stat in StatName) {
	// 		const statKey = stat as unknown as StatName;
	// 		const roll = roll4d6DropWorst();
	// 		const bonus = Math.floor((roll - 10) / 2);
	// 		if (randomizedStats[statKey]) {
	// 			randomizedStats[statKey].raw = roll;
	// 			randomizedStats[statKey].bonus = bonus;
	// 		} else {
	// 			randomizedStats[statKey] = {
	// 				raw: roll,
	// 				bonus: bonus,
	// 			};
	// 		}
	// 	}

	// 	this.updateStatsAndSkills(randomizedStats, skillProficiencies);
	// }
}
