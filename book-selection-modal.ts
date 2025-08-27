import { App, Modal, ButtonComponent, Notice } from 'obsidian';
import { FlashcardStudyModal } from './flashcard-modal';
import { SpacedRepetitionSystem } from './spaced-repetition';
import { KindleClipping, BookGroup, IKindleCardsPlugin } from './types';
import { DebugLogger } from './logger';

export class BookSelectionModal extends Modal {
    private bookGroups: BookGroup[];
    private originalClippings: KindleClipping[];
    private plugin: IKindleCardsPlugin | null;

    constructor(app: App, clippings: KindleClipping[], plugin?: IKindleCardsPlugin) {
        super(app);
        this.originalClippings = clippings;
        this.plugin = plugin || null;
        this.bookGroups = this.groupFlashcardsByBook(clippings);
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.addClass('book-selection-modal');

        this.createHeader();
        this.createBookList();
        this.createFooterActions();
    }

    private createHeader() {
        const headerEl = this.contentEl.createEl('div', { cls: 'book-selection-header' });

        headerEl.createEl('h2', { text: '📚 Select Books to Study' });
        headerEl.createEl('p', {
            text: `Found ${this.originalClippings.length} flashcards from ${this.bookGroups.length} books`,
            cls: 'book-selection-subtitle'
        });

        // Close button
        const closeButton = headerEl.createEl('button', {
            cls: 'book-selection-close-btn',
            text: '×'
        });
        closeButton.onclick = () => this.close();
    }

    private createBookList() {
        const listContainer = this.contentEl.createEl('div', { cls: 'book-list-container' });

        // Sort books by flashcard count (most first) then alphabetically
        const sortedBooks = [...this.bookGroups].sort((a, b) => {
            if (b.count !== a.count) {
                return b.count - a.count;
            }
            return a.title.localeCompare(b.title);
        });

        this.bookGroups.forEach(book => {
            const bookEl = listContainer.createEl('div', { cls: 'book-item' });
            const bookInfo = bookEl.createEl('div', { cls: 'book-info' });

            // Title
            bookInfo.createEl('div', {
                text: book.title,
                cls: 'book-title'
            });

            // Author (only if not empty)
            if (book.author && book.author.trim()) {
                bookInfo.createEl('div', {
                    text: `by ${book.author}`,
                    cls: 'book-author'
                });
            }

            // Flashcard count
            bookInfo.createEl('div', {
                text: `${book.count} flashcards`,
                cls: 'book-count'
            });

            // Study button
            new ButtonComponent(bookEl)
                .setButtonText('Study')
                .setCta()
                .onClick(() => {
                    this.close();
                    this.startStudySession(book.flashcards, book.title);
                });
        });
    }

    private createFooterActions() {
        const footerEl = this.contentEl.createEl('div', { cls: 'book-selection-footer' });

        new ButtonComponent(footerEl)
            .setButtonText('Study All Books')
            .setWarning()
            .onClick(() => {
                this.close();
                this.startStudySession(this.originalClippings, 'All Books');
            });

        new ButtonComponent(footerEl)
            .setButtonText('Cancel')
            .onClick(() => this.close());
    }

    private groupFlashcardsByBook(clippings: KindleClipping[]): BookGroup[] {
        const bookMap = new Map<string, BookGroup>();

        clippings.forEach(clipping => {
            const bookKey = this.getBookKey(clipping);

            if (!bookMap.has(bookKey)) {
                // Clean up the author field, but preserve valid authors
                let cleanAuthor = (clipping.author || '').trim();

                // Only clear if it's explicitly unknown
                if (cleanAuthor === 'Unknown' ||
                    cleanAuthor === 'Unknown Author' ||
                    cleanAuthor.toLowerCase() === 'unknown author' ||
                    cleanAuthor.toLowerCase() === 'unknown') {
                    cleanAuthor = '';
                }

                bookMap.set(bookKey, {
                    title: (clipping.title || 'Unknown Book').trim(),
                    author: cleanAuthor,
                    flashcards: [],
                    count: 0
                });
            }

            const bookGroup = bookMap.get(bookKey)!;
            bookGroup.flashcards.push(clipping);
            bookGroup.count = bookGroup.flashcards.length;
        });

        const result = Array.from(bookMap.values());
        DebugLogger.log('Grouped clippings into', result.length, 'books');
        return result;
    }    private getBookKey(clipping: KindleClipping): string {
        // Create a unique key for each book based on title and author
        const title = (clipping.title || 'Unknown Book').toLowerCase().trim();
        let author = (clipping.author || '').toLowerCase().trim();

        // Normalize unknown author variations
        if (!author ||
            author === 'unknown' ||
            author === 'unknown author' ||
            author === 'author unknown') {
            author = '';
        }

        return `${title}|||${author}`;
    }

    private startStudySession(clippings: KindleClipping[], bookTitle: string) {
        if (clippings.length === 0) {
            new Notice('No flashcards found to study.');
            return;
        }

        // If spaced repetition is enabled, sort by priority, otherwise shuffle
        let sortedClippings = clippings;
        if (this.plugin?.settings?.enableSpacedRepetition && this.plugin.spacedRepetition) {
            // Generate card IDs and sort by spaced repetition priority
            const cardIds = clippings.map(clipping =>
                SpacedRepetitionSystem.generateCardId(clipping.title, clipping.author, clipping.content)
            );
            const sortedIds = this.plugin.spacedRepetition.getSortedCards(cardIds);

            // Reorder clippings based on sorted IDs
            const clippingMap = new Map();
            clippings.forEach((clipping, index) => {
                clippingMap.set(cardIds[index], clipping);
            });

            sortedClippings = sortedIds.map((id: string) => clippingMap.get(id)).filter(Boolean);
        } else {
            // Shuffle the cards for traditional studying
            sortedClippings = this.shuffleArray([...clippings]);
        }

        // Open the study modal with book context and plugin
        const studyModal = new FlashcardStudyModal(this.app, sortedClippings, bookTitle, this.plugin);
        studyModal.open();
    }

    private shuffleArray<T>(array: T[]): T[] {
        const shuffled = [...array];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
