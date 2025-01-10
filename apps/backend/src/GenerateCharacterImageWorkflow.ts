import { WorkflowEntrypoint, WorkflowStep, WorkflowEvent } from 'cloudflare:workers';

// User-defined params passed to your workflow
type Params = {
	characterId: string;
};

export class GenerateCharacterImageWorkflow extends WorkflowEntrypoint<Env, Params> {
	async run(event: WorkflowEvent<Params>, step: WorkflowStep) {
		const imagePrompt = await step.do('generate image prompt', async () => {
			const id = this.env.CHARACTERS.idFromName(event.payload.characterId);
			const character = await this.env.CHARACTERS.get(id);
			const characterState = await character.getCharacterState();
			const prompt = `Generate a prompt for an AI image generator to create an image of ${characterState.name}, a ${characterState.race} ${
				characterState.characterClass || ''
			} with the following back story and physical description
          Backstory: ${characterState.backstory}
          Physical Description: ${characterState.appearance}

					Be as descriptive as possible and highlight the unique features of the character.
					Do not include any preamble or instructions. Just the prompt.
        `;
			const promptResponse = (await this.env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
				prompt,
			})) as {
				response?: string;
				tool_calls?: {
					name: string;
					arguments: unknown;
				}[];
			};
			return promptResponse.response;
		});

		const characterImage = await step.do('generate character image', async () => {
			//@ts-ignore
			const response = (await this.env.AI.run('@cf/black-forest-labs/flux-1-schnell', {
				prompt: imagePrompt,
				steps: 8,
				height: 512,
				width: 512,
			})) as AiTextToImageOutput;
			//@ts-ignore
			return response.image;
		});
		await step.do('save character image to r2 and update character DO', async () => {
			const id = this.env.CHARACTERS.idFromName(event.payload.characterId);
			const character = await this.env.CHARACTERS.get(id);

			// Convert base64 to buffer
			const binaryString = atob(characterImage);

			// @ts-ignore
			const imageBuffer = Uint8Array.from(binaryString, (m) => m.codePointAt(0));
			const imageKey = `characters/${event.payload.characterId}/avatar.jpg`;

			// Upload to R2
			await this.env.CHARACTER_IMAGES.put(imageKey, imageBuffer, {
				httpMetadata: {
					contentType: 'image/jpeg',
				},
			});

			// Store reference in character
			await character.setImage(imageKey);
		});
	}
}
