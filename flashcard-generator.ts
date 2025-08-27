import { KindleClipping } from './types';

export class FlashcardGenerator {

	static generateFlashcard(clipping: KindleClipping, template: string): string {
		return template
			.replace(/\{\{highlight\}\}/g, clipping.content)
			.replace(/\{\{content\}\}/g, clipping.content)
			.replace(/\{\{quote\}\}/g, clipping.content)
			.replace(/\{\{title\}\}/g, clipping.title)
			.replace(/\{\{author\}\}/g, clipping.author)
			.replace(/\{\{location\}\}/g, clipping.location)
			.replace(/\{\{date\}\}/g, clipping.date)
			.replace(/\{\{type\}\}/g, clipping.type);
	}

	static sanitizeFileName(fileName: string): string {
		return fileName
			.replace(/[\\/:*?"<>|]/g, '-')
			.replace(/\s+/g, ' ')
			.trim()
			.substring(0, 200);
	}
}
