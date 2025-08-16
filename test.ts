import { KindleParser } from './kindle-parser';
import { FlashcardGenerator } from './flashcard-generator';

// Simple test functions for development
export class KindleCardsTest {
    static runTests() {
        console.log('Running KindleCards tests...');

        this.testKindleParser();
        this.testFlashcardGenerator();

        console.log('All tests completed!');
    }

    static testKindleParser() {
        console.log('Testing KindleParser...');

        const sampleContent = `Atomic Habits (James Clear)
- Your Highlight on Location 123-125 | Added on Wednesday, January 15, 2025 10:30:00 AM

Every action you take is a vote for the type of person you wish to become.
==========
The Midnight Library (Matt Haig)
- Your Highlight on Location 789-792 | Added on Wednesday, January 15, 2025 11:00:00 AM

Between life and death there is a library, and within that library, the shelves go on forever.
==========`;

        // Test validation
        const validation = KindleParser.validateClippingsFile(sampleContent);
        console.log('Validation result:', validation);

        // Test parsing
        const clippings = KindleParser.parseClippings(sampleContent);
        console.log('Parsed clippings:', clippings);

        // Test individual clipping
        if (clippings.length > 0) {
            const firstClipping = clippings[0];
            console.log('First clipping details:');
            console.log('- Title:', firstClipping.title);
            console.log('- Author:', firstClipping.author);
            console.log('- Content:', firstClipping.content);
        }
    }

    static testFlashcardGenerator() {
        console.log('Testing FlashcardGenerator...');

        const sampleClipping = {
            title: 'Atomic Habits',
            author: 'James Clear',
            type: 'Highlight',
            location: '123-125',
            date: 'Wednesday, January 15, 2025 10:30:00 AM',
            content: 'Every action you take is a vote for the type of person you wish to become.'
        };

        // Test default template
        const defaultTemplate = '{{content}}\n?\n*From "{{title}}" by {{author}}*';
        const flashcard = FlashcardGenerator.generateFlashcard(sampleClipping, defaultTemplate);
        console.log('Generated flashcard:');
        console.log(flashcard);

        // Test filename generation
        const fileName = FlashcardGenerator.generateFileName(sampleClipping);
        console.log('Generated filename:', fileName);

        // Test template preview
        const preview = FlashcardGenerator.previewTemplate(defaultTemplate);
        console.log('Template preview:');
        console.log(preview);
    }
}
