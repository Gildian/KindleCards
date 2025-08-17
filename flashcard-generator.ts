import { KindleClipping } from './main';

export interface FlashcardTemplate {
    name: string;
    description: string;
    template: string;
    fileExtension?: string; // Allow different file types
    frontmatter?: string; // YAML frontmatter
}

export interface FlashcardOptions {
    addTags?: boolean;
    addBacklinks?: boolean;
    addFrontmatter?: boolean;
    groupByBook?: boolean;
}

export class FlashcardGenerator {
    static readonly DEFAULT_TEMPLATES: FlashcardTemplate[] = [
        {
            name: 'Simple Q&A',
            description: 'Basic spaced repetition format',
            template: '{{content}}\n\n---\n\n**Source:** {{title}} by {{author}}\n**Location:** {{location}}'
        },
        {
            name: 'Anki Style',
            description: 'Compatible with Anki import format',
            template: '{{content}}\n#flashcard\n\n---\n\n**Answer:** {{content}}\n\n**Book:** {{title}}\n**Author:** {{author}}\n**Location:** {{location}}\n**Date Added:** {{date}}'
        },
        {
            name: 'Obsidian Spaced Repetition',
            description: 'Works with Obsidian Spaced Repetition plugin',
            template: '{{content}} #card\n<!--SR:!2023-01-01,1,230-->\n\n**Source:** "{{title}}" by {{author}}\n**Location:** {{location}}'
        },
        {
            name: 'Question & Answer',
            description: 'Clear Q&A format with context',
            template: '## Question\n\nWhat insight does {{author}} share in "{{title}}"?\n\n## Answer\n\n{{content}}\n\n## Context\n\n**Book:** {{title}}\n**Author:** {{author}}\n**Location:** {{location}}\n**Type:** {{type}}\n**Date:** {{date}}'
        },
        {
            name: 'Cloze Deletion',
            description: 'Fill-in-the-blank style cards',
            template: '{{content}}\n\n==Key concept from "{{title}}" by {{author}}==\n\n**Location:** {{location}}\n\n#cloze #kindle-highlight'
        },
        {
            name: 'Book Summary',
            description: 'Focus on book and author with quote',
            template: '# {{title}}\n\n**Author:** {{author}}\n\n## Key Quote (Location {{location}})\n\n> {{content}}\n\n**Added:** {{date}}\n\n#book-summary #kindle-highlight'
        },
        {
            name: 'Study Note',
            description: 'Academic style with tags',
            template: '# Study Note\n\n## Quote\n\n"{{content}}"\n\n## Source\n\n{{author}}. *{{title}}*. Location {{location}}.\n\n## Reflection\n\n*[Add your thoughts here]*\n\n## Tags\n\n#kindle-highlight #{{author}} #study-notes\n\n---\n*Added: {{date}}*'
        },
        {
            name: 'Roam Research Style',
            description: 'Block-based format with references',
            template: '- {{content}}\n  - **Source:** [[{{title}}]] by [[{{author}}]]\n  - **Location:** {{location}}\n  - **Date:** {{date}}\n  - **Tags:** #highlight #kindle #{{author}}'
        }
    ];

    static generateFlashcard(clipping: KindleClipping, template: string, options: FlashcardOptions = {}): string {
        let content = template
            .replace(/\{\{highlight\}\}/g, clipping.content)
            .replace(/\{\{content\}\}/g, clipping.content)
            .replace(/\{\{quote\}\}/g, clipping.content)
            .replace(/\{\{title\}\}/g, clipping.title)
            .replace(/\{\{author\}\}/g, clipping.author)
            .replace(/\{\{location\}\}/g, clipping.location)
            .replace(/\{\{date\}\}/g, clipping.date)
            .replace(/\{\{type\}\}/g, clipping.type);

        // Add automatic tags if requested
        if (options.addTags) {
            const tags = this.generateTags(clipping);
            content += `\n\n${tags}`;
        }

        // Add backlinks if requested
        if (options.addBacklinks) {
            const backlinks = this.generateBacklinks(clipping);
            content += `\n\n${backlinks}`;
        }

        return content;
    }

    static generateFlashcardWithFrontmatter(clipping: KindleClipping, template: FlashcardTemplate, options: FlashcardOptions = {}): string {
        let content = '';

        // Add YAML frontmatter if template has it
        if (template.frontmatter || options.addFrontmatter) {
            content += this.generateFrontmatter(clipping, template.frontmatter);
        }

        // Add the main content
        content += this.generateFlashcard(clipping, template.template, options);

        return content;
    }

    private static generateFrontmatter(clipping: KindleClipping, customFrontmatter?: string): string {
        if (customFrontmatter) {
            return this.replacePlaceholders(customFrontmatter, clipping) + '\n\n';
        }

        return `---
title: "${clipping.title} - ${clipping.location}"
author: "${clipping.author}"
book: "${clipping.title}"
location: "${clipping.location}"
date: "${clipping.date}"
type: "${clipping.type}"
tags:
  - kindle-highlight
  - ${this.sanitizeTag(clipping.author)}
  - ${this.sanitizeTag(clipping.title)}
---

`;
    }

    private static generateTags(clipping: KindleClipping): string {
        const authorTag = this.sanitizeTag(clipping.author);
        const titleTag = this.sanitizeTag(clipping.title);
        return `#kindle-highlight #${authorTag} #${titleTag} #${clipping.type.toLowerCase()}`;
    }

    private static generateBacklinks(clipping: KindleClipping): string {
        return `**Related:** [[${clipping.title}]] | [[${clipping.author}]] | [[Kindle Highlights]]`;
    }

    private static sanitizeTag(text: string): string {
        return text
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '');
    }

    private static replacePlaceholders(template: string, clipping: KindleClipping): string {
        return template
            .replace(/\{\{title\}\}/g, clipping.title)
            .replace(/\{\{author\}\}/g, clipping.author)
            .replace(/\{\{location\}\}/g, clipping.location)
            .replace(/\{\{date\}\}/g, clipping.date)
            .replace(/\{\{type\}\}/g, clipping.type)
            .replace(/\{\{content\}\}/g, clipping.content);
    }

    static generateFileName(clipping: KindleClipping, pattern: string = '{{title}} - {{location}}', extension: string = '.md'): string {
        const fileName = pattern
            .replace(/\{\{title\}\}/g, clipping.title)
            .replace(/\{\{author\}\}/g, clipping.author)
            .replace(/\{\{location\}\}/g, clipping.location)
            .replace(/\{\{date\}\}/g, clipping.date)
            .replace(/\{\{type\}\}/g, clipping.type);

        return this.sanitizeFileName(fileName) + extension;
    }

    static generateGroupedFileName(clipping: KindleClipping, groupBy: 'book' | 'author' | 'date' = 'book'): string {
        switch (groupBy) {
            case 'author':
                return `${this.sanitizeFileName(clipping.author)}/${this.sanitizeFileName(clipping.title)} - ${clipping.location}.md`;
            case 'date':
                const date = new Date(clipping.date).toISOString().split('T')[0];
                return `${date}/${this.sanitizeFileName(clipping.title)} - ${clipping.location}.md`;
            case 'book':
            default:
                return `${this.sanitizeFileName(clipping.title)}/${this.sanitizeFileName(clipping.title)} - ${clipping.location}.md`;
        }
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
