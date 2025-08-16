import { KindleClipping } from './main';

export interface FlashcardTemplate {
    name: string;
    description: string;
    template: string;
}

export class FlashcardGenerator {
    static readonly DEFAULT_TEMPLATES: FlashcardTemplate[] = [
        {
            name: 'Simple Q&A',
            description: 'Highlight as question, content as answer',
            template: '{{highlight}}\n?\n{{content}}'
        },
        {
            name: 'Book Quote',
            description: 'Include book and author information',
            template: '{{content}}\n?\n*From "{{title}}" by {{author}}*\nLocation: {{location}}'
        },
        {
            name: 'Detailed Card',
            description: 'Full information with metadata',
            template: '**Quote:** {{content}}\n\n**Source:** {{title}} by {{author}}\n**Location:** {{location}}\n**Date:** {{date}}\n?\n{{content}}'
        },
        {
            name: 'Cloze Deletion',
            description: 'Create cloze deletion cards',
            template: '{{content}}\n?\n*Key concept from {{title}}*'
        }
    ];

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

    static generateFileName(clipping: KindleClipping, pattern: string = '{{title}} - {{location}}'): string {
        const fileName = pattern
            .replace(/\{\{title\}\}/g, clipping.title)
            .replace(/\{\{author\}\}/g, clipping.author)
            .replace(/\{\{location\}\}/g, clipping.location)
            .replace(/\{\{date\}\}/g, clipping.date)
            .replace(/\{\{type\}\}/g, clipping.type);

        return this.sanitizeFileName(fileName) + '.md';
    }

    static sanitizeFileName(fileName: string): string {
        return fileName
            .replace(/[\\/:*?"<>|]/g, '-')
            .replace(/\s+/g, ' ')
            .trim()
            .substring(0, 200); // Limit length
    }

    static previewTemplate(template: string): string {
        const sampleClipping: KindleClipping = {
            title: 'Sample Book',
            author: 'Sample Author',
            type: 'Highlight',
            location: '123-125',
            date: 'Monday, January 15, 2025 10:30:00 AM',
            content: 'This is a sample highlight from a book.'
        };

        return this.generateFlashcard(sampleClipping, template);
    }
}
